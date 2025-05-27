import { LlmRequest } from './LlmRequest.js';
import { LlmResponse } from './LlmResponse.js';

/**
 * Base interface for Large Language Model (LLM) integrations.
 * Defines the contract for generating content, counting tokens, etc.
 */
export interface IBaseLlm {
  /** A pattern (e.g., glob or regex string) that this LLM implementation can handle. */
  modelNamePattern: string; // Or string[] if it can handle multiple distinct patterns

  /**
   * Generates content based on the provided request (non-streaming).
   * @param request The LlmRequest object containing prompts, config, etc.
   * @returns A Promise resolving to an LlmResponse object.
   */
  generateContentAsync(request: LlmRequest): Promise<LlmResponse>;

  /**
   * Generates content as a stream based on the provided request.
   * @param request The LlmRequest object.
   * @returns An AsyncGenerator yielding LlmResponse chunks.
   */
  generateContentStreamAsync(request: LlmRequest): AsyncGenerator<LlmResponse, void, unknown>;

  /**
   * Counts the number of tokens in the given request content.
   * @param request The LlmRequest containing the content to count.
   *                     Typically, only the `contents` field is used.
   * @returns A Promise resolving to the total token count.
   */
  countTokensAsync(request: LlmRequest): Promise<number>;

  /**
   * Optional method to perform any necessary initialization for the LLM client.
   */
  init?(): Promise<void>;

  /**
   * Optional method to clean up resources used by the LLM client.
   */
  close?(): Promise<void>;
} 