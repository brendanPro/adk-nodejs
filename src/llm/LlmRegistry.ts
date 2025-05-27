import { IBaseLlm } from '../models/IBaseLlm.js';
import { ILlmRegistry } from './ILlmRegistry.js';

type LlmEntry = IBaseLlm | (() => IBaseLlm | Promise<IBaseLlm>);

/**
 * A concrete implementation of ILlmRegistry.
 * Manages a collection of named LLM instances or factories.
 */
export class LlmRegistry implements ILlmRegistry {
  private llms: Map<string, LlmEntry> = new Map();
  private resolvedLlms: Map<string, IBaseLlm> = new Map(); // Cache for factory-resolved instances

  public registerLlm(
    name: string,
    llmInstanceOrFactory: LlmEntry
  ): void {
    if (this.llms.has(name)) {
      console.warn(`LlmRegistry: LLM with name '${name}' is already registered. Overwriting.`);
    }
    this.llms.set(name, llmInstanceOrFactory);
    this.resolvedLlms.delete(name); // Clear any cached resolved instance
  }

  public async getLlm(name: string): Promise<IBaseLlm | undefined> {
    if (this.resolvedLlms.has(name)) {
      return this.resolvedLlms.get(name);
    }

    const entry = this.llms.get(name);
    if (!entry) {
      return undefined;
    }

    if (typeof entry === 'function') {
      try {
        const llmInstance = await Promise.resolve(entry());
        if (!llmInstance || typeof llmInstance.generateContentAsync !== 'function') { // Basic check for IBaseLlm compatibility
            throw new Error(`Factory for LLM '${name}' did not return a valid IBaseLlm instance.`);
        }
        this.resolvedLlms.set(name, llmInstance); // Cache the resolved instance
        return llmInstance;
      } catch (error) {
        console.error(`LlmRegistry: Error resolving LLM '${name}' from factory:`, error);
        throw error; // Re-throw the error to indicate failure
      }
    } else {
      // It's a direct instance
      this.resolvedLlms.set(name, entry); // Cache the instance
      return entry;
    }
  }

  public listLlms(): string[] {
    return Array.from(this.llms.keys());
  }

  public unregisterLlm(name: string): boolean {
    const wasDeleted = this.llms.delete(name);
    this.resolvedLlms.delete(name); // Also remove from resolved cache
    return wasDeleted;
  }

  /**
   * Clears all registered LLMs from the registry.
   * Useful for testing or resetting state.
   */
  public clearAllLlms(): void {
    this.llms.clear();
    this.resolvedLlms.clear();
  }
} 