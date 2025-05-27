import { BaseTool } from './BaseTool.js';
import { ToolParametersSchema } from './ITool.js';
import { ToolContext } from '../common/ToolContext.js';
import { Content } from '../models/LlmContent.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WrappedFunction = (args: Record<string, any>, context: ToolContext) => Promise<any> | any;

export interface FunctionToolProps {
  name: string;
  description: string;
  parametersSchema?: ToolParametersSchema;
  func: WrappedFunction;
  /** 
   * Optional flag to indicate if the raw output of the function should be directly
   * returned as Content (e.g. if the function already returns a Content object).
   * If false (default), the output is wrapped in a Content object with a text part.
   */
  returnsContentDirectly?: boolean;
}

/**
 * A tool that wraps a JavaScript/TypeScript function.
 */
export class FunctionTool extends BaseTool {
  private func: WrappedFunction;
  private returnsContentDirectly: boolean;

  constructor(props: FunctionToolProps) {
    super(props); // Pass name, description, parametersSchema to BaseTool
    if (typeof props.func !== 'function') {
      throw new Error(`FunctionTool '${props.name}': func property must be a function.`);
    }
    this.func = props.func;
    this.returnsContentDirectly = props.returnsContentDirectly || false;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<Content | string> {
    try {
      const result = await this.func(args, context);

      if (this.returnsContentDirectly) {
        // Assume the function returned a Content object or a string meant to be Content
        if (typeof result === 'string' || (result && typeof result === 'object' && 'parts' in result)) {
            return result as Content | string;
        } else {
            console.warn(`FunctionTool '${this.name}' was set to return Content directly, but did not receive a Content-like object or string. Wrapping as text.`);
            return { parts: [{ text: JSON.stringify(result, null, 2) }] };
        }
      }

      // Default behavior: wrap the result in a Content object with a text part.
      if (typeof result === 'string') {
        return { parts: [{ text: result }] };
      } else if (result === undefined) {
        return { parts: [{ text: `Tool '${this.name}' executed successfully with no return value.`}] };
      } else {
        // For non-string results, stringify them.
        // Consider more sophisticated serialization or allowing tools to return structured Content.
        return { parts: [{ text: JSON.stringify(result, null, 2) }] };
      }
    } catch (error: any) {
      console.error(`FunctionTool '${this.name}' execution error:`, error);
      // Return error as a Content object for the LLM to process
      return {
        parts: [
          {
            text: `Error executing tool '${this.name}': ${error.message}`,
          },
        ],
      };
    }
  }
} 