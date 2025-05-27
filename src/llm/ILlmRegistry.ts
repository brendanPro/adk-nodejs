import { IBaseLlm } from '../models/IBaseLlm.js';

/**
 * Defines the contract for an LLM Registry,
 * which manages and provides access to different LLM instances.
 */
export interface ILlmRegistry {
  /**
   * Registers an LLM provider instance or a factory function for creating instances.
   *
   * @param name The unique name or key to identify this LLM provider (e.g., 'gemini-pro', 'openai-gpt4').
   * @param llmInstanceOrFactory An instance of IBaseLlm or a factory function that returns an IBaseLlm instance.
   *                             A factory can be useful for deferred initialization or creating multiple instances.
   */
  registerLlm(
    name: string,
    llmInstanceOrFactory: IBaseLlm | (() => IBaseLlm | Promise<IBaseLlm>)
  ): void;

  /**
   * Retrieves an LLM provider instance by its registered name.
   *
   * @param name The name of the LLM provider to retrieve.
   * @returns The IBaseLlm instance, or undefined if not found.
   * @throws Error if the factory function fails or returns an invalid instance.
   */
  getLlm(name: string): Promise<IBaseLlm | undefined>;

  /**
   * Lists the names of all registered LLM providers.
   *
   * @returns An array of registered LLM provider names.
   */
  listLlms(): string[];

  /**
   * Unregisters an LLM provider.
   *
   * @param name The name of the LLM provider to unregister.
   * @returns True if an LLM was unregistered, false otherwise.
   */
  unregisterLlm(name: string): boolean;
} 