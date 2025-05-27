import { ILlmRequestProcessor } from '../FlowProcessor.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { InvocationContext } from '../../common/InvocationContext.js';
import { IToolset } from '../../tools/IToolset.js';
import { BaseAgent } from '../../agents/index.js';
import { FunctionDeclaration, Tool as GenerativeAiTool } from '../../models/LlmContent.js';

/**
 * An LlmRequestProcessor that adds function declarations from a toolset
 * to the LlmRequest, enabling the LLM to call tools.
 */
export class FunctionRequestProcessor implements ILlmRequestProcessor {
  private toolset?: IToolset;

  constructor(toolset?: IToolset) {
    this.toolset = toolset;
  }

  async processRequest(
    request: LlmRequest,
    context: InvocationContext
  ): Promise<LlmRequest | void> {
    let toolsetToUse = this.toolset;

    if (!toolsetToUse && context.agent instanceof BaseAgent) {
      const agentWithToolset = context.agent as BaseAgent & { toolset?: IToolset };
      if (agentWithToolset.toolset) {
        toolsetToUse = agentWithToolset.toolset;
      }
    }

    if (!toolsetToUse) {
      return request;
    }

    const functionDeclarations: FunctionDeclaration[] =
      await toolsetToUse.getFunctionDeclarations(undefined);

    if (functionDeclarations.length === 0) {
      return request;
    }

    const generativeAiTool: GenerativeAiTool = {
      functionDeclarations: functionDeclarations,
    };

    if (!request.tools) {
      request.tools = [generativeAiTool];
    } else {
      request.tools.push(generativeAiTool);
    }
    
    if (!request.toolConfig) {
      request.toolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
        },
      };
    } else if (!request.toolConfig.functionCallingConfig) {
      request.toolConfig.functionCallingConfig = {
        mode: 'ANY',
      };
    }

    return request;
  }
} 