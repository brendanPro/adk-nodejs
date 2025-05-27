import { LlmRequest } from '../models/LlmRequest.js';
import { LlmResponse, Candidate } from '../models/LlmResponse.js';
import { Content, FunctionCall } from '../models/LlmContent.js'; // Assuming Part is also exported here if EventData needs it explicitly

// Define ArtifactDetail if it's not defined elsewhere and is needed by EventData
export interface ArtifactDetail {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any; // Could be string, Buffer, or a more complex type
  type?: string; // e.g., 'text/plain', 'image/png', 'application/json'
  path?: string; // Optional path if the artifact is stored as a file
}

export enum EventType {
  MESSAGE = 'MESSAGE',
  INVOCATION_START = 'INVOCATION_START',
  INVOCATION_END = 'INVOCATION_END',
  LLM_REQUEST = 'LLM_REQUEST',
  LLM_RESPONSE = 'LLM_RESPONSE',
  TOOL_CALL = 'TOOL_CALL',
  TOOL_RESULT = 'TOOL_RESULT',
  TOOL_RESPONSE = 'TOOL_RESPONSE',
  ERROR = 'ERROR',
  LIVE_UPDATE = 'LIVE_UPDATE',
  AUTH = 'AUTH',
  AGENT_TRANSFER = 'AGENT_TRANSFER',
  CUSTOM = 'CUSTOM',
  SYSTEM_MESSAGE = 'SYSTEM_MESSAGE',
  AGENT_REQUEST = 'AGENT_REQUEST',
  AGENT_RESPONSE = 'AGENT_RESPONSE',
  AGENT_TRANSFER_REQUEST = 'AGENT_TRANSFER_REQUEST',
  AGENT_TRANSFER_ACCEPT = 'AGENT_TRANSFER_ACCEPT',
  AGENT_TRANSFER_REJECT = 'AGENT_TRANSFER_REJECT',
  AUTH_CONFIG_REQUEST = 'AUTH_CONFIG_REQUEST',
  AUTH_DATA_REQUEST = 'AUTH_DATA_REQUEST',
  AUTH_DATA_RESPONSE = 'AUTH_DATA_RESPONSE',
  SESSION_CREATE = 'SESSION_CREATE',
  SESSION_SAVE = 'SESSION_SAVE',
  ARTIFACT_SAVE = 'ARTIFACT_SAVE',
  RUN_START = 'RUN_START',
  RUN_COMPLETE = 'RUN_COMPLETE',
}

export type EventSourceType = 'USER' | 'AGENT' | 'TOOL' | 'SYSTEM' | 'LLM' | 'RUNNER';

export interface EventSource {
  type: EventSourceType;
  name: string; 
}

export interface EventActions {
  transferToAgent?: string; 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestedAuthConfigs?: Record<string, any>; 
  saveArtifacts?: boolean; // Added for Runner.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; 
}

export interface EventData {
  content?: Content; // Imported from LlmContent.ts
  error?: {
    message: string;
    code?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any;
  };
  // The following can be top-level on Event OR nested here. 
  // For this version, let's keep them top-level on Event and remove from EventData if duplicated.
  // llmRequest?: LlmRequest; 
  // llmResponse?: LlmResponse; 
  // candidate?: Candidate;
  // functionCalls?: FunctionCall[]; 
  // _originalFunctionCalls?: Record<string, FunctionCall>; 
  transferInfo?: {
    targetAgent: string;
    reason?: string;
  };
  authData?: {
    toolName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    credentials: any; 
  };
  artifacts?: ArtifactDetail[]; // Added for Runner.ts
  message?: string; // For simple messages in data, e.g. system messages if not using content.parts
}

/**
 * Represents an event within the agent interaction lifecycle.
 */
export interface Event {
  readonly eventId: string;
  readonly interactionId: string;
  readonly sessionId: string;
  readonly userId?: string;
  readonly appName?: string;
  readonly type: EventType;
  readonly source: EventSource;
  readonly timestamp: Date;
  readonly data?: EventData; 
  readonly actions?: EventActions;
  readonly tags?: string[];
  readonly parentEventId?: string;

  // Top-level optional fields for LLM interactions and tool calls
  readonly llmRequest?: LlmRequest;
  readonly llmResponse?: LlmResponse;
  readonly functionCalls?: FunctionCall[]; 
  readonly _originalFunctionCalls?: Record<string, FunctionCall>; 
} 