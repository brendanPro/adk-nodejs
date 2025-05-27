import { ILlmResponseProcessor } from '../FlowProcessor.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { LlmResponse } from '../../models/LlmResponse.js';
import { InvocationContext } from '../../common/InvocationContext.js';
import { IToolset } from '../../tools/IToolset.js';
import { BaseAgent } from '../../agents/index.js';
import { Event, EventType } from '../../common/Event.js';
import { Content } from '../../models/LlmContent.js';
import { FunctionCall, FunctionResponse, Part } from '../../models/LlmContent.js';
import { createToolContext } from '../../common/ToolContext.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * An LlmResponseProcessor that handles function calls from the LLM.
 * It executes the requested tool and prepares a new LlmRequest with the tool's output.
 */
export class FunctionResponseProcessor implements ILlmResponseProcessor {
  private toolset?: IToolset;

  constructor(toolset?: IToolset) {
    this.toolset = toolset;
  }

  async processResponse(
    response: LlmResponse,
    request: LlmRequest,
    context: InvocationContext
  ): Promise<LlmResponse | Event | void> {
    const functionCalls = this.extractFunctionCalls(response);
    if (!functionCalls || functionCalls.length === 0) {
      return response; // No function calls, pass response through
    }

    let toolsetToUse = this.toolset;
    if (!toolsetToUse && context.agent instanceof BaseAgent) {
      const agentWithToolset = context.agent as BaseAgent & { toolset?: IToolset };
      if (agentWithToolset.toolset) {
        toolsetToUse = agentWithToolset.toolset;
      }
    }

    if (!toolsetToUse) {
      console.warn('FunctionResponseProcessor: Function call received, but no toolset is available to execute it.');
      // Optionally, return an error event or a modified response indicating the tool cannot be found.
      // For now, just returning the original response, which the LLM might interpret as an issue.
      return response; 
    }

    const toolResponses: FunctionResponse[] = [];
    const originalFunctionCallMap: Record<string, FunctionCall> = {};

    for (const funcCall of functionCalls) {
      const toolName = funcCall.name;
      const toolArgs = funcCall.args || {}; // Ensure args is an object
      const functionCallId = `${context.invocationId}-fc-${uuidv4()}`;
      originalFunctionCallMap[functionCallId] = funcCall;

      const tool = toolsetToUse.getTool(toolName);
      if (!tool) {
        console.error(`Tool '${toolName}' not found in toolset.`);
        toolResponses.push({
          name: toolName,
          response: {
            parts: [{ text: `Error: Tool '${toolName}' not found.` }],
            // role: 'tool' // Role for tool response parts
          },
        });
        continue;
      }

      try {
        const toolCallContext = createToolContext(context, functionCallId);
        
        // TODO: Implement BeforeToolExecution callbacks from tool
        if (tool.beforeExecution) {
          const callbacks = Array.isArray(tool.beforeExecution) ? tool.beforeExecution : [tool.beforeExecution];
          for (const cb of callbacks) {
            await cb(toolCallContext, toolArgs);
          }
        }

        const executionResult = await toolsetToUse.executeTool(toolName, toolArgs, toolCallContext);
        
        // TODO: Implement AfterToolExecution callbacks from tool
        if (tool.afterExecution) {
          const callbacks = Array.isArray(tool.afterExecution) ? tool.afterExecution : [tool.afterExecution];
          for (const cb of callbacks) {
            await cb(toolCallContext, executionResult);
          }
        }
        
        // Convert executionResult (Content | string) to Content for FunctionResponse
        let resultPartContent: Content;
        if (typeof executionResult === 'string') {
          resultPartContent = { parts: [{ text: executionResult }] };
        } else {
          resultPartContent = executionResult; // Assumes it's already Content
        }

        toolResponses.push({
          name: toolName,
          response: resultPartContent,
        });

        // TODO: Handle actions from toolCallContext.actions (e.g., agent transfer)
        // This might involve returning an Event instead of modifying LlmResponse directly.

      } catch (error: any) {
        console.error(`Error executing tool '${toolName}':`, error);
        toolResponses.push({
          name: toolName,
          response: {
            parts: [{ text: `Error executing tool '${toolName}': ${error.message}` }],
          },
        });
      }
    }

    // Prepare tool response parts for the next LLM call
    const toolResponseParts: Part[] = toolResponses.map(tr => ({ functionResponse: tr }));

    // Determine flow behavior based on the agent's flow type
    const flowName = (context.agent as any)?.flow?.name || (context.agent as any)?.flow?.constructor?.name;
    const isSingleFlow = flowName === 'SingleFlow';



    if (isSingleFlow) {
      // SingleFlow behavior: Set session state flags and return void to allow normal event creation
      const requestWithToolResults: LlmRequest = {
        ...request,
        contents: [
          ...request.contents,
          { role: 'tool', parts: toolResponseParts }
        ]
      };

      context.session.state.set('_requires_llm_rerun_with_tool_results', true);
      context.session.state.set('_current_llm_request_with_tool_results', requestWithToolResults);


      return; // Return void to allow SingleFlow to create the LLM_RESPONSE event
    } else {
      // AutoFlow behavior: Return TOOL_RESPONSE Event
      const toolResponseEvent: Event = {
        eventId: `${context.invocationId}-tool-response-${Date.now()}`,
        interactionId: context.invocationId,
        sessionId: context.session.id,
        userId: context.session.userId,
        appName: context.session.appName,
        type: EventType.TOOL_RESPONSE,
        source: { type: 'SYSTEM', name: 'FunctionResponseProcessor' },
        timestamp: new Date(),
        data: {
          content: { parts: toolResponseParts },
        },
        llmResponse: response, // Include the original LLM response for AutoFlow tests
        _originalFunctionCalls: originalFunctionCallMap,
      };

      return toolResponseEvent;
    }
  }

  private extractFunctionCalls(response: LlmResponse): FunctionCall[] | undefined {
    if (!response || !response.candidates || response.candidates.length === 0) {
      return undefined;
    }
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      // Check if parts contain function calls (Google's newer API style)
      if (candidate.content && candidate.content.parts) {
        const fcParts = candidate.content.parts.filter(part => part.functionCall);
        if (fcParts.length > 0) {
          return fcParts.map(part => part.functionCall as FunctionCall);
        }
      }
      // Fallback or alternative: check candidate.functionCalls (older or different style)
      if (candidate.functionCalls && candidate.functionCalls.length > 0) {
        return candidate.functionCalls;
      }
    }
    return undefined;
  }
} 