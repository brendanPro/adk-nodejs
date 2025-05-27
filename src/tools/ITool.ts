import { InvocationContext } from '../common/InvocationContext.js';
import { ToolContext } from '../common/ToolContext.js';
import { LlmRequest } from '../models/LlmRequest.js';
import { LlmResponse } from '../models/LlmResponse.js';
import { FunctionDeclaration, AdkJsonSchema } from '../models/LlmContent.js';
import { 
  BeforeToolExecutionCallback, 
  AfterToolExecutionCallback, 
  ProcessToolLlmRequestCallback,
  ProcessToolLlmResponseCallback
} from './ToolCallbacks.js';
import { Content } from '../models/LlmContent.js';

/**
 * Represents the schema for a tool's parameters, conforming to AdkJsonSchema.
 */
export type ToolParametersSchema = AdkJsonSchema;

/**
 * Base interface for all tools that an agent can use.
 */
export interface ITool {
  /** The name of the tool. Must be unique within a toolset. */
  name: string;

  /** Description of what the tool does. Used by LLMs to decide when to use it. */
  description: string;

  /** Schema definition for the parameters this tool accepts. */
  parametersSchema?: ToolParametersSchema;

  /** Callbacks invoked before the tool's primary execution logic. */
  beforeExecution?: BeforeToolExecutionCallback | BeforeToolExecutionCallback[];

  /** Callbacks invoked after the tool's primary execution logic. */
  afterExecution?: AfterToolExecutionCallback | AfterToolExecutionCallback[];

  /**
   * Converts the tool definition into a FunctionDeclaration suitable for LLM APIs.
   * @param context Optional context for preparing the declaration.
   * @returns A Promise resolving to a FunctionDeclaration object.
   */
  asFunctionDeclaration(context?: ToolContext): Promise<FunctionDeclaration>;

  /**
   * Executes the tool with the given arguments.
   * @param args The arguments for the tool, conforming to parametersSchema.
   * @param context The context in which the tool is being executed.
   * @returns A Promise resolving to the result of the tool execution, typically as Content or a string.
   */
  execute(args: Record<string, any>, context: ToolContext): Promise<Content | string>;

  // Optional: Direct hooks for LlmRequest/LlmResponse processing if the tool needs to influence them
  // beyond just exposing a function. These were part of the Python BaseTool.

  /**
   * Allows the tool to modify the LlmRequest before it's sent to the LLM.
   * For example, to add tool-specific instructions or configurations.
   * @param request The LlmRequest to modify.
   * @param context The current invocation context.
   */
  processLlmRequest?(request: LlmRequest, context: InvocationContext): Promise<void> | void;

  /**
   * Allows the tool to process the LlmResponse after it's received from the LLM.
   * @param response The LlmResponse to process.
   * @param request The original LlmRequest.
   * @param context The current invocation context.
   */
  processLlmResponse?(
    response: LlmResponse, 
    request: LlmRequest, 
    context: InvocationContext
  ): Promise<void> | void;
} 