import { Content } from '../models/LlmContent.js';
import { SafetySetting, Tool } from '../models/LlmContent.js'; // Tool and SafetySetting are from LlmContent
import { GenerationConfig } from '../models/LlmRequest.js'; // GenerationConfig is from LlmRequest

/**
 * Configuration specific to an LLM-powered agent or LLM calls.
 */
export interface LlmAgentConfig {
  /** 
   * System instructions for the LLM. 
   * This can be a string or a Content object for more complex system prompts.
   */
  instructions?: string | Content;

  /** Default model name to use if not overridden. */
  modelName?: string;

  /** Default generation configuration. */
  generationConfig?: GenerationConfig;

  /** Default safety settings. */
  safetySettings?: SafetySetting[];

  /** Default tools available to this agent's LLM calls. */
  tools?: Tool[];

  /** Default tool configuration (e.g., function calling mode). */
  toolConfig?: {
    functionCallingConfig?: {
      mode: 'ANY' | 'AUTO' | 'NONE';
      allowedFunctionNames?: string[];
    }
  };
  
  // Add other llm-specific configurations here as needed
  [key: string]: any; // Allows for additional, unspecified properties
} 