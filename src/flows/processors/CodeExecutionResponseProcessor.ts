import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { LlmResponse } from '../../models/LlmResponse.js';
import { Event, EventType } from '../../common/Event.js';
import { ILlmResponseProcessor } from '../FlowProcessor.js';
import { FunctionCall, Part, FunctionResponse as AdkFunctionResponse, Content } from '../../models/LlmContent.js';
import { CODE_EXECUTION_TOOL_NAME } from './CodeExecutionRequestProcessor.js';
import { ICodeExecutor } from '../../services/ICodeExecutor.js'; // Will be used when implemented

/**
 * Processor to handle LLM responses that request code execution.
 * It will manage the execution and prepare results for the next LLM call.
 */
export class CodeExecutionResponseProcessor implements ILlmResponseProcessor {
  async processResponse(
    response: LlmResponse, 
    request: LlmRequest, 
    context: InvocationContext
  ): Promise<LlmResponse | Event | void> {
    const modelResponseContent = response.candidates?.[0]?.content;
    if (!modelResponseContent || !modelResponseContent.parts) {
      return response; // No parts to process
    }

    const codeExecutionRequests: { part: Part; call: FunctionCall }[] = [];
    for (const part of modelResponseContent.parts) {
      if (part.functionCall && part.functionCall.name === CODE_EXECUTION_TOOL_NAME) {
        codeExecutionRequests.push({ part, call: part.functionCall });
      }
    }

    if (codeExecutionRequests.length === 0) {
      return response; // No code execution requested
    }

    const codeExecutor = context.services?.codeExecutor as ICodeExecutor | undefined;
    if (!codeExecutor) {
        // console.warn(`CodeExecutionResponseProcessor: ${CODE_EXECUTION_TOOL_NAME} requested by LLM, but no ICodeExecutor service is configured in InvocationContext.services.`);
        // Create an error response part for each missing execution
        const errorResults: AdkFunctionResponse[] = codeExecutionRequests.map(req => ({
            name: req.call.name,
            response: {
                role: 'tool', // Or 'function' if schema expects that
                parts: [{ text: `Error: Code execution service is not available to execute code for tool ${req.call.name}.` }],
            }
        }));
         // Add these error results to the context for the LLM to see.
        let nextRequest = context.session.state.get('_current_llm_request_with_tool_results') || 
                          { ...request, contents: [...request.contents] };
        if (!nextRequest.contents.some((c: Content) => c.role === 'model' && c.parts.some((p: Part) => p.functionCall?.name === CODE_EXECUTION_TOOL_NAME))) {
            nextRequest.contents.push(modelResponseContent); // Add the model's request for tool call
        }
        nextRequest.contents.push({
            role: 'tool',
            parts: errorResults.map(fr => ({ functionResponse: fr }))
        });
        context.session.state.set('_requires_llm_rerun_with_tool_results', true);
        context.session.state.set('_current_llm_request_with_tool_results', nextRequest);
        return response; // Return original response, the re-run flag will cause SingleFlow to loop
    }
    
    // console.log(`CodeExecutionResponseProcessor: Found ${codeExecutionRequests.length} code execution requests.`);

    // In a full implementation, we might execute these in parallel if the executor supports it.
    // For now, sequential execution.
    const toolResponseParts: Part[] = [];
    let executionOccurred = false;

    for (const req of codeExecutionRequests) {
      const { language, code } = req.call.args as { language?: string; code?: string } || {};

      if (!language || !code) {
        toolResponseParts.push({
          functionResponse: {
            name: req.call.name,
            response: {
                role: 'tool',
                parts: [{ text: `Error: Missing 'language' or 'code' argument for ${req.call.name}.` }],
            }
          },
        });
        continue;
      }

      try {
        // console.log(`CodeExecutionResponseProcessor: Executing code for ${req.call.name} (lang: ${language})`);
        const executionResult = await codeExecutor.execute(language, code, context);
        executionOccurred = true;

        let resultText = '';
        if (executionResult.stdout) resultText += `Stdout:\n${executionResult.stdout}\n`;
        if (executionResult.stderr) resultText += `Stderr:\n${executionResult.stderr}\n`;
        if (executionResult.error) {
          resultText += `Error: ${executionResult.error.name} - ${executionResult.error.message}\n`;
          if (executionResult.error.stack) resultText += `Stack:\n${executionResult.error.stack}\n`;
        }
        if (!resultText) resultText = 'Code executed successfully with no output.';
        
        toolResponseParts.push({
          functionResponse: {
            name: req.call.name,
            response: {
                role: 'tool',
                parts: [{ text: resultText }], // TODO: Consider if structured output (artifacts?) is needed
            }
          },
        });
      } catch (execError: any) {
        executionOccurred = true; // Attempted execution
        // console.error(`CodeExecutionResponseProcessor: Error executing code for ${req.call.name}`, execError);
        toolResponseParts.push({
          functionResponse: {
            name: req.call.name,
            response: {
                role: 'tool',
                parts: [{ text: `Execution failed: ${execError.message}` }],
            }
          },
        });
      }
    }

    if (executionOccurred && toolResponseParts.length > 0) {
      // Prepare for next LLM turn with tool results
      let nextRequest = context.session.state.get('_current_llm_request_with_tool_results') || 
                        { ...request, contents: [...request.contents] };

      // Add the original model response that requested the tool call (if not already there from a previous processor)
      if (!nextRequest.contents.some((c: Content) => c.role === 'model' && c.parts.some((p: Part) => p.functionCall?.name === CODE_EXECUTION_TOOL_NAME))) {
         nextRequest.contents.push(modelResponseContent);
      }
      // Add the tool results
      nextRequest.contents.push({
        role: 'tool',
        parts: toolResponseParts,
      });

      context.session.state.set('_requires_llm_rerun_with_tool_results', true);
      context.session.state.set('_current_llm_request_with_tool_results', nextRequest);
      // console.log('CodeExecutionResponseProcessor: Stored tool results, requesting LLM re-run.');
    }
    
    // Return the original LlmResponse; SingleFlow/AutoFlow will handle the re-run based on session state.
    return response;
  }
} 