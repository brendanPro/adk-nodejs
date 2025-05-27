import { ITool, ToolParametersSchema } from './ITool.js';
import { FunctionDeclaration } from '../models/LlmContent.js';
import { ToolContext } from '../common/ToolContext.js';
import { Content } from '../models/LlmContent.js';

/**
 * Abstract base class for tools, providing common functionality.
 */
export abstract class BaseTool implements ITool {
  readonly name: string;
  readonly description: string;
  readonly parametersSchema?: ToolParametersSchema;

  constructor(props: {
    name: string;
    description: string;
    parametersSchema?: ToolParametersSchema;
  }) {
    if (!props.name) {
      throw new Error('Tool name cannot be empty.');
    }
    this.name = props.name;
    this.description = props.description;
    this.parametersSchema = props.parametersSchema;
  }

  async asFunctionDeclaration(context?: ToolContext): Promise<FunctionDeclaration> {
    if (!this.parametersSchema) {
      console.warn(`Tool '${this.name}' has no parametersSchema defined. LLM may not be able to call it effectively if it expects parameters.`);
    }
    return {
      name: this.name,
      description: this.description,
      parameters: this.parametersSchema,
    };
  }

  /**
   * Abstract method for tool execution logic.
   * Subclasses must implement this to define the tool's behavior.
   */
  abstract execute(args: Record<string, any>, context: ToolContext): Promise<Content | string>;
} 