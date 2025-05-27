// Re-exporting Content and Part types, potentially from a central definition or a library.
// For now, using placeholders consistent with Event.ts and IArtifactService.ts
// import { FunctionCall, FunctionResponse } from './LlmContent.js'; // Removed conflicting import

// Placeholder for Google's Content type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// export type Content = any; 

// Placeholder for Google's Part type (used within Content)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// export type Part = any;

/**
 * Represents a single part of a multi-part Content message.
 */
export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // Base64 encoded string
  };
  functionCall?: FunctionCall; 
  functionResponse?: FunctionResponse;
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
  // Potentially other part types like video, etc.
}

/**
 * Represents a multi-part message or turn in a conversation.
 */
export interface Content {
  parts: Part[];
  role?: string; // 'user', 'model', 'function', 'system' (system is often outside contents or special)
}

/**
 * Represents a function call requested by the LLM.
 * Based on Google's FunctionCall type.
 */
export interface FunctionCall {
  name: string;
  args: Record<string, any>;
}

/**
 * Represents the result of a function call (tool execution).
 * Based on Google's FunctionResponse type.
 */
export interface FunctionResponse {
  name: string;
  response: {
    // The actual content of the response, can be structured.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content?: any; 
    // Or directly use a more specific type if all tools return a common shape
    [key: string]: any; 
  };
}

// Define JSON Schema types for ADK, mirroring Google's Schema structure
export enum AdkJsonSchemaType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
}

export interface AdkJsonSchema {
  type: AdkJsonSchemaType;
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  items?: AdkJsonSchema; // For ARRAY type
  properties?: Record<string, AdkJsonSchema>; // For OBJECT type
  required?: string[]; // For OBJECT type
}

/**
 * Represents a tool or function that the LLM can call.
 * Based on Google's Tool and FunctionDeclaration types.
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: AdkJsonSchema; // Updated from Record<string, any>
}

export interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  // Potentially other types of tools later (e.g., code interpreter)
}

/** Harm categories that can be configured for safety settings. */
export enum AdkHarmCategory { // Renamed from HarmCategoryAdk for consistency if other Adk enums exist
  HARASSMENT = 'HARM_CATEGORY_HARASSMENT',
  HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH',
  SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT',
  UNSPECIFIED = 'HARM_CATEGORY_UNSPECIFIED', // Added for completeness
}

/** Thresholds for blocking content based on harm categories. */
export enum AdkHarmBlockThreshold { // Renamed from HarmBlockThresholdAdk
  BLOCK_NONE = 'BLOCK_NONE',
  BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
  BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
  BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
  UNSPECIFIED = 'HARM_BLOCK_THRESHOLD_UNSPECIFIED', // Added for completeness
}

/** Configuration for safety settings of an LLM request. */
export interface SafetySetting { // This is ADK's SafetySetting
  category: AdkHarmCategory;
  threshold: AdkHarmBlockThreshold;
}

/** Harm probability levels returned by the LLM. */
export enum AdkHarmProbability {
  NEGLIGIBLE = 'NEGLIGIBLE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  UNSPECIFIED = 'HARM_PROBABILITY_UNSPECIFIED', // Match Google's unspecified value
}

/** Represents a safety rating for a piece of content, as returned by the LLM. */
export interface AdkSafetyRating {
  category: AdkHarmCategory;
  probability: AdkHarmProbability;
  blocked?: boolean; // Optional, as it might not always be present or applicable
}

/** Union type for possible finish reasons. */
export type FinishReasonType =
  | 'STOP' 
  | 'MAX_TOKENS' 
  | 'SAFETY' 
  | 'RECITATION' 
  | 'OTHER' 
  | 'TOOL_CALLS' 
  | 'CANCELLED' 
  | 'ERROR';

/** 
 * Information about the generation process for a candidate. 
 * This interface might be deprecated if its fields are moved directly to Candidate types.
 * For now, it defines the structure for finishReason and safetyRatings.
 */
export interface GenerationInfo {
  finishReason?: FinishReasonType;
  safetyRatings?: AdkSafetyRating[]; 
} 