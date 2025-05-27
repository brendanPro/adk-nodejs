import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { ILlmRequestProcessor } from '../FlowProcessor.js';
import { Tool, AdkJsonSchemaType } from '../../models/LlmContent.js';

// Standard tool name for code execution
export const CODE_EXECUTION_TOOL_NAME = 'execute_code'; // Or 'code_interpreter', 'execute_python_code' etc.

/**
 * Processor to prepare the LLM request for code execution capabilities.
 */
export class CodeExecutionRequestProcessor implements ILlmRequestProcessor {
  async processRequest(request: LlmRequest, context: InvocationContext): Promise<LlmRequest | void> {
    // Ensure the code execution tool is available to the LLM
    // This assumes a tool definition similar to FunctionTool will be created/registered.
    // For now, we'll just add a basic tool declaration if not present.

    const codeExecutionToolSchema = {
      name: CODE_EXECUTION_TOOL_NAME,
      description: 'Executes code in a specified language (e.g., python, javascript) and returns the output or errors. Use for calculations, data manipulation, or any task requiring code execution.',
      parameters: {
        type: AdkJsonSchemaType.OBJECT,
        properties: {
          language: {
            type: AdkJsonSchemaType.STRING,
            description: 'The programming language of the code (e.g., "python", "javascript").',
          },
          code: {
            type: AdkJsonSchemaType.STRING,
            description: 'The code snippet to execute.',
          },
        },
        required: ['language', 'code'],
      },
    };

    if (!request.tools) {
      request.tools = [];
    }

    const hasCodeTool = request.tools.some(
        (toolWrapper) => toolWrapper.functionDeclarations?.some(fd => fd.name === CODE_EXECUTION_TOOL_NAME)
    );

    if (!hasCodeTool) {
        // A more robust solution would involve a CodeExecutionTool that implements ITool
        // and is added to the agent's toolset. This processor would then ensure
        // its schema is included. For now, we add it directly.
        const toolWrapper: Tool = {
            functionDeclarations: [codeExecutionToolSchema]
        };
      request.tools.push(toolWrapper);
    }

    // Optionally, add/modify system instructions to guide the LLM on using this tool.
    // For example:
    // if (request.contents.find(c => c.role === 'system')) {
    //   // Modify existing system instruction
    // } else {
    //   // Add new system instruction
    // }
    // console.log('CodeExecutionRequestProcessor: Updated request with code execution tool.', request);
    return request;
  }
} 