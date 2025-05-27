import { IToolset } from './IToolset.js';
import { ITool } from './ITool.js';
import { FunctionDeclaration } from '../models/LlmContent.js';
import { ToolContext } from '../common/ToolContext.js';
import { Content } from '../models/LlmContent.js';

/**
 * Base implementation for a toolset.
 */
export class BaseToolset implements IToolset {
  readonly name?: string;
  protected tools: Map<string, ITool> = new Map();

  constructor(props?: { name?: string; tools?: ITool[] }) {
    this.name = props?.name;
    if (props?.tools) {
      props.tools.forEach(tool => this.addTool(tool));
    }
  }

  getTool(toolName: string): ITool | undefined {
    return this.tools.get(toolName);
  }

  addTool(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Toolset '${this.name || 'Unnamed'}': Tool with name '${tool.name}' already exists.`
      );
    }
    this.tools.set(tool.name, tool);
  }

  removeTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  getTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  async getFunctionDeclarations(context?: ToolContext): Promise<FunctionDeclaration[]> {
    const declarations: FunctionDeclaration[] = [];
    for (const tool of this.tools.values()) {
      try {
        const declaration = await tool.asFunctionDeclaration(context);
        declarations.push(declaration);
      } catch (error) {
        console.error(
          `Toolset '${this.name || 'Unnamed'}': Error getting function declaration for tool '${tool.name}':`,
          error
        );
        // Optionally, decide if a single tool error should prevent all declarations
      }
    }
    return declarations;
  }

  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: ToolContext
  ): Promise<Content | string> {
    const tool = this.getTool(toolName);
    if (!tool) {
      throw new Error(`Toolset '${this.name || 'Unnamed'}': Tool '${toolName}' not found.`);
    }

    try {
      // 1. Before Execution
      if (tool.beforeExecution) {
        const callbacks = Array.isArray(tool.beforeExecution) ? tool.beforeExecution : [tool.beforeExecution];
        for (const cb of callbacks) {
          await cb(context, args);
        }
      }

      // 2. Execute
      const result = await tool.execute(args, context);

      // 3. After Execution
      if (tool.afterExecution) {
        const callbacks = Array.isArray(tool.afterExecution) ? tool.afterExecution : [tool.afterExecution];
        for (const cb of callbacks) {
          await cb(context, result);
        }
      }
      return result;

    } catch (error: any) {
      console.error(
        `Toolset '${this.name || 'Unnamed'}': Error during lifecycle of tool '${toolName}':`,
        error
      );
      // TODO: Consider invoking tool.onError(error, context, args) here if implemented
      // if (tool.onError) { // Assuming onError might be added to ITool
      //   try {
      //      await tool.onError(error, context, args); // Or a similar signature
      //   } catch (onErrorError) {
      //      console.error(`Error in tool.onError for ${toolName}:`, onErrorError);
      //   }
      // }
      throw error; 
    }
  }
} 