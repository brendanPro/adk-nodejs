import { InvocationContext } from '../common/InvocationContext.js';
import { LlmRequest } from '../models/LlmRequest.js';
import { LlmResponse } from '../models/LlmResponse.js';
import { Event } from '../common/Event.js';

/**
 * Interface for a processor that acts on an LlmRequest before it is sent.
 */
export interface ILlmRequestProcessor {
  /**
   * Processes the LlmRequest.
   * Can modify the request in place or return a new one.
   * @param request The LlmRequest to process.
   * @param context The current invocation context.
   * @returns A Promise resolving to the processed LlmRequest, or void if modified in place.
   */
  processRequest(
    request: LlmRequest,
    context: InvocationContext
  ): Promise<LlmRequest | void> | LlmRequest | void;
}

/**
 * Interface for a processor that acts on an LlmResponse after it is received.
 */
export interface ILlmResponseProcessor {
  /**
   * Processes the LlmResponse.
   * Can modify the response in place or return a new one.
   * It can also produce an Event based on the response (e.g., for function calls or errors).
   * @param response The LlmResponse to process.
   * @param request The original LlmRequest that led to this response.
   * @param context The current invocation context.
   * @returns A Promise resolving to the processed LlmResponse, or an Event, or void if modified in place.
   */
  processResponse(
    response: LlmResponse,
    request: LlmRequest, // Original request is often needed for context
    context: InvocationContext
  ): Promise<LlmResponse | Event | void> | LlmResponse | Event | void;
} 