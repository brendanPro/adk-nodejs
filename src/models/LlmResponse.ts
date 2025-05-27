import { 
    Content, 
    AdkSafetyRating, 
    FinishReasonType, 
    GenerationInfo // Added GenerationInfo import
    // FunctionCall, // Not used directly in this file if Candidate.functionCalls is removed or handled differently
} from './LlmContent.js';

/**
 * Represents a single candidate response from the LLM.
 */
export interface Candidate {
  index?: number;
  content: Content;
  finishReason?: FinishReasonType;
  safetyRatings?: AdkSafetyRating[];
  tokenCount?: number;
  citationMetadata?: { citationSources?: { startIndex?: number; endIndex?: number; uri?: string; license?: string; }[] };
  // Removed explicit functionCalls?: FunctionCall[]; as function calls are part of Content.parts
  // Ensure other model-specific fields can be added:
  [key: string]: any; 
}

/** Represents an error that occurred during an LLM interaction. */
export interface LlmError {
  code: number;
  message: string;
  details?: any;
}

/**
 * Represents the overall response from an LLM, which may include multiple candidates.
 */
export interface LlmResponse {
  /** The model name that generated this response. */
  model: string;

  /** Optional request ID associated with this response. */
  requestId?: string;

  /** A list of candidate responses from the LLM. */
  candidates: Candidate[];

  /** Information about the prompt feedback, if any. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  promptFeedback?: {
    blockReason?: string;
    safetyRatings: AdkSafetyRating[]; // Changed SafetyRating to AdkSafetyRating
    // blockReasonMessage is part of Google's API but might be verbose for ADK default
  };

  /** Usage metadata, like token counts. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usageMetadata?: { 
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    [key: string]: any; // For other potential usage data
  };

  /** Error information, if an error occurred. */
  error?: LlmError; // Changed from Error to LlmError

  /** 
   * Aggregated generation information for the entire request, if available.
   * Sometimes this is on a per-candidate basis in `candidate.generationInfo`.
   */
  generationInfo?: GenerationInfo; // Changed to use imported GenerationInfo

  /**
   * Raw response from the underlying LLM SDK, if access is needed for debugging or advanced use cases.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResponse?: any;

  [key: string]: any;
} 