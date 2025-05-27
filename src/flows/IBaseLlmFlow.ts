import { InvocationContext } from '../common/InvocationContext.js';
import { LlmRequest } from '../models/LlmRequest.js';
import { LlmResponse } from '../models/LlmResponse.js';
import { Event } from '../common/Event.js';
import { ILlmRequestProcessor, ILlmResponseProcessor } from './FlowProcessor.js';
import { IBaseLlm } from '../models/IBaseLlm.js';

/**
 * Base interface for LLM interaction flows.
 * Defines the structure for processing requests and responses with an LLM.
 */
export interface IBaseLlmFlow {
  /** The name of the flow. */
  name: string;

  /** Optional description of the flow. */
  description?: string;

  /** Request processors to be applied before sending the request to the LLM. */
  requestProcessors: ILlmRequestProcessor[];

  /** Response processors to be applied after receiving the response from the LLM. */
  responseProcessors: ILlmResponseProcessor[];

  /**
   * Runs a full interaction cycle with the LLM.
   * This involves:
   * 1. Preparing the LlmRequest using request processors.
   * 2. Sending the request to the LLM.
   * 3. Processing the LlmResponse using response processors.
   * 4. Generating an Event based on the outcome.
   *
   * @param currentLlmRequest The initial LlmRequest for this interaction.
   * @param llm The IBaseLlm instance to use for the LLM call.
   * @param context The current invocation context.
   * @returns A Promise resolving to an Event representing the outcome of the LLM interaction.
   */
  runLlmInteraction(
    currentLlmRequest: LlmRequest,
    llm: IBaseLlm,
    context: InvocationContext
  ): Promise<Event>;

  /**
   * Helper method to apply all request processors sequentially.
   * @param request The LlmRequest to process.
   * @param context The current invocation context.
   * @returns The processed LlmRequest.
   */
  applyRequestProcessors(
    request: LlmRequest,
    context: InvocationContext
  ): Promise<LlmRequest>;

  /**
   * Helper method to apply all response processors sequentially.
   * @param response The LlmResponse to process.
   * @param request The original LlmRequest.
   * @param context The current invocation context.
   * @returns The final LlmResponse or an Event if a processor short-circuited.
   */
  applyResponseProcessors(
    response: LlmResponse,
    request: LlmRequest,
    context: InvocationContext
  ): Promise<LlmResponse | Event>;

  /**
   * Runs a full LLM interaction cycle, including applying request and response processors,
   * and calling the underlying LLM.
   * @param initialLlmRequest The initial LlmRequest to start the interaction.
   * @param llm The IBaseLlm instance to use for the LLM call.
   * @param context The current invocation context.
   * @returns A Promise resolving to an Event representing the outcome of the interaction.
   */
  runLlmInteraction(
    initialLlmRequest: LlmRequest,
    llm: IBaseLlm,
    context: InvocationContext
  ): Promise<Event>;

  /**
   * Utility method to create a basic LlmRequest object.
   * Subclasses or processors will populate its fields.
   * @param modelName The name of the model to be used.
   * @param context The current invocation context.
   * @returns An LlmRequest object.
   */
  createInitialLlmRequest(modelName: string, context: InvocationContext): LlmRequest;

  /**
   * Utility method to select an LLM instance from the registry.
   * @param modelName The desired model name.
   * @param context The invocation context.
   * @returns An IBaseLlm instance.
   * @throws Error if the LLM cannot be found or instantiated.
   */
  getLlmInstance(modelName: string, context: InvocationContext): Promise<IBaseLlm>;
} 