import { ToolContext } from '../common/ToolContext.js';
import { InvocationContext } from '../common/InvocationContext.js';
import { Content } from '../models/LlmContent.js';
import { LlmRequest } from '../models/LlmRequest.js';
import { LlmResponse } from '../models/LlmResponse.js';
import { FunctionCall } from '../models/LlmContent.js';

/**
 * Callback invoked before a tool's primary execution logic.
 * @param context The tool context.
 * @param args The arguments the tool will be executed with.
 * @returns A Promise resolving to void, or void.
 */
export type BeforeToolExecutionCallback = (
  context: ToolContext,
  args: Record<string, any>
) => Promise<void> | void;

/**
 * Callback invoked after a tool's primary execution logic.
 * @param context The tool context.
 * @param result The result from the tool's execution.
 * @returns A Promise resolving to void, or void.
 */
export type AfterToolExecutionCallback = (
  context: ToolContext,
  result: Content | string 
) => Promise<void> | void;

/**
 * Callback type for a tool to process an LlmRequest before it is sent.
 * This would typically be part of a tool's own definition if it needs to 
 * directly influence the LLM request beyond its standard function declaration.
 */
export type ProcessToolLlmRequestCallback = (
  request: LlmRequest, 
  context: InvocationContext
) => Promise<LlmRequest | void> | LlmRequest | void;

/**
 * Callback type for a tool to process an LlmResponse after it is received.
 * This would typically be part of a tool's own definition.
 */
export type ProcessToolLlmResponseCallback = (
  response: LlmResponse, 
  request: LlmRequest, 
  context: InvocationContext
) => Promise<LlmResponse | void> | LlmResponse | void;

/**
 * Callback for handling a function call from an LLM response.
 * This is typically used by a flow processor responsible for tool dispatch,
 * rather than being a callback on an individual tool.
 * @param context The current invocation context.
 * @param functionCall The FunctionCall object from the LLM.
 * @returns A Promise resolving to the content to be sent back to the LLM (as a FunctionResponse part).
 */
export type HandleFunctionCallCallback = (
  context: InvocationContext,
  functionCall: FunctionCall
) => Promise<Content>; // Result will be wrapped in a FunctionResponse part 