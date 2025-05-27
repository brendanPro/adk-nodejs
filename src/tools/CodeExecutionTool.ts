import { ITool } from './ITool.js';
import { FunctionDeclaration, AdkJsonSchemaType, Part, Content } from '../models/LlmContent.js'; // Added Content
import { InvocationContext } from '../common/InvocationContext.js';
import { ToolContext } from '../common/ToolContext.js'; // Added ToolContext
import { CODE_EXECUTION_TOOL_NAME } from '../flows/processors/CodeExecutionRequestProcessor.js';
import { ICodeExecutor, CodeExecutionResult } from '../services/ICodeExecutor.js'; // Corrected path

export class CodeExecutionTool implements ITool {
  readonly name: string = CODE_EXECUTION_TOOL_NAME;
  readonly description: string = 'Executes code in a specified language (e.g., python, javascript) and returns the output or errors. Use for calculations, data manipulation, or any task requiring code execution.';
  
  readonly parametersSchema: FunctionDeclaration['parameters'] = {
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
  };

  constructor(private codeExecutor?: ICodeExecutor) {}

  async asFunctionDeclaration(context?: ToolContext): Promise<FunctionDeclaration> { // context type updated
    return {
      name: this.name,
      description: this.description,
      parameters: this.parametersSchema,
    };
  }

  async execute(args: { language?: string; code?: string }, toolContext: ToolContext): Promise<Content> { // context type and return type updated
    const invContext = toolContext.invocationContext;
    if (!invContext) {
      return { parts: [{ text: `Error: InvocationContext not available in ToolContext for ${this.name}.` }] };
    }
    
    const executor = this.codeExecutor || invContext.services?.codeExecutor;

    if (!executor) {
      return { parts: [{
        text: `Error: Code execution service is not available for tool ${this.name}. Cannot execute code.`,
      }]};
    }

    const { language, code } = args;
    if (!language || !code) {
      return { parts: [{
        text: `Error: Missing 'language' or 'code' argument for ${this.name}.`,
      }]};
    }

    try {
      const result: CodeExecutionResult = await executor.execute(language, code, invContext);
      let resultText = '';
      if (result.stdout) resultText += `Stdout:\n${result.stdout}\n`;
      if (result.stderr) resultText += `Stderr:\n${result.stderr}\n`;
      if (result.error) {
        resultText += `Error: ${result.error.name} - ${result.error.message}\n`;
        if (result.error.stack) resultText += `Stack:\n${result.error.stack}\n`;
      }
      if (!resultText && !result.error) resultText = 'Code executed successfully with no output.';
      
      return { parts: [{ text: resultText.trim() }] };
    } catch (execError: any) {
      return { parts: [{
        text: `Execution failed for tool ${this.name}: ${execError.message}`,
      }]};
    }
  }
}
