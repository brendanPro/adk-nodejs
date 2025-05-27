import { IBaseLlm } from './IBaseLlm.js';

/**
 * A registry for LLM provider instances.
 * Allows registering and retrieving LLM implementations by name or pattern.
 */
export class LlmRegistry {
  private static llms: Map<string, IBaseLlm> = new Map();
  // TODO: Support for pattern-based matching if needed, e.g. "gemini-*"

  /**
   * Registers an LLM instance with the registry.
   * @param name The name or identifier for the LLM (e.g., 'gemini-pro', 'openai/gpt-4').
   * @param llmInstance The LLM instance that implements IBaseLlm.
   */
  static registerLlm(name: string, llmInstance: IBaseLlm): void {
    if (this.llms.has(name)) {
      console.warn(`LlmRegistry: LLM with name '${name}' is already registered. Overwriting.`);
    }
    this.llms.set(name, llmInstance);
  }

  /**
   * Retrieves an LLM instance from the registry.
   * @param name The name of the LLM to retrieve.
   * @returns The IBaseLlm instance, or undefined if not found.
   */
  static getLlm(name: string): IBaseLlm | undefined {
    const llm = this.llms.get(name);
    if (!llm) {
        // Basic pattern matching for prefixes like 'gemini-'
        // For more complex patterns, a more robust matching system would be needed.
        for (const [key, value] of this.llms.entries()) {
            if (name.startsWith(key.replace('*', '')) && key.endsWith('*')) {
                return value;
            }
            // Simple wildcard match (e.g. models/gemini-1.5-pro-latest, key models/gemini-*) 
            if (key.includes('*')){
              const prefix = key.substring(0, key.indexOf('*'));
              if (name.startsWith(prefix)){
                return value;
              }
            }
        }
        console.warn(`LlmRegistry: LLM with name '${name}' not found.`);
        return undefined;
    }
    return llm;
  }

  /**
   * Clears all registered LLMs. Useful for testing or resetting state.
   */
  static clearAllLlms(): void {
    this.llms.clear();
  }

  /**
   * Lists the names of all registered LLMs.
   * @returns An array of registered LLM names.
   */
  static listRegisteredLlms(): string[] {
    return Array.from(this.llms.keys());
  }
} 