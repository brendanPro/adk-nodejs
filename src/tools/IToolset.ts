import { ITool } from './ITool.js';
import { FunctionDeclaration } from '../models/LlmContent.js';
import { ToolContext } from '../common/ToolContext.js';
import { Content } from '../models/LlmContent.js';

/**
 * Interface for a collection of tools.
 * Manages tools and provides methods to access and execute them.
 */
export interface IToolset {
  /** A descriptive name for the toolset (optional). */
  readonly name?: string;

  /**
   * Retrieves a tool by its name.
   * @param toolName The name of the tool to retrieve.
   * @returns The ITool instance, or undefined if not found.
   */
  getTool(toolName: string): ITool | undefined;

  /**
   * Adds a tool to the toolset.
   * @param tool The ITool instance to add.
   * @throws Error if a tool with the same name already exists.
   */
  addTool(tool: ITool): void;

  /**
   * Removes a tool from the toolset by its name.
   * @param toolName The name of the tool to remove.
   * @returns True if the tool was found and removed, false otherwise.
   */
  removeTool(toolName: string): boolean;

  /**
   * Gets all tools in the toolset.
   * @returns An array of ITool instances.
   */
  getTools(): ITool[];

  /**
   * Generates a list of FunctionDeclarations for all tools in the toolset.
   * These are suitable for providing to an LLM.
   * @param context Optional context for preparing the declarations.
   * @returns A Promise resolving to an array of FunctionDeclaration objects.
   */
  getFunctionDeclarations(context?: ToolContext): Promise<FunctionDeclaration[]>;

  /**
   * Executes a named tool with the given arguments and context.
   * @param toolName The name of the tool to execute.
   * @param args The arguments for the tool.
   * @param context The context for tool execution.
   * @returns A Promise resolving to the tool's execution result (Content or string).
   * @throws Error if the tool is not found.
   */
  executeTool(
    toolName: string,
    args: Record<string, any>,
    context: ToolContext
  ): Promise<Content | string>;
}
