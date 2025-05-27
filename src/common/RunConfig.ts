import { Content } from '../models/LlmContent.js';
import { Event } from './Event.js';
import { SessionState } from './Session.js';

/**
 * Configuration settings for an agent run.
 */
export interface RunConfig {
  /** Maximum number of LLM interactions allowed in a single run. */
  maxInteractions?: number;

  /** Default model name to use if not specified by the agent. */
  defaultModelName?: string;

  /** Application name, can be used by services. */
  appName?: string;

  /** Any other custom configuration parameters. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  runId?: string;
  sessionId?: string;
  userId?: string;
  agentName: string;
  input: Content | string; // Input can be structured Content or simple string
  // Agent-specific config can be nested here if needed, or passed via a dedicated field
  agentConfig?: any; 
  // Other runner-level configurations
  saveHistory?: boolean;    // Example
  saveArtifacts?: boolean;  // Example
}

export interface RunOutput {
  runId: string;
  sessionId?: string;
  /** The final, conclusive output from the agent, often derived from the last significant event. */
  output?: any; 
  finalState?: SessionState; // The final state of the session
  error?: {
    message: string;
    details?: string;
    code?: string | number;
  };
  /** A complete log of all events that were yielded during the run. */
  events: Event[]; 
}

/**
 * Enum for the type of run being performed.
 * Not currently used in RunConfig/RunOutput but kept for potential future use.
 */
export enum RunType {
  SINGLE_TURN = 'SINGLE_TURN',
  MULTI_TURN = 'MULTI_TURN',
  STREAMING = 'STREAMING',
} 