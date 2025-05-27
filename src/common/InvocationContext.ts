import { Session } from './Session.js';
import { Event } from './Event.js'; // Assuming Content is also in Event.ts or imported there
import { Content } from '../models/LlmContent.js';
import { IAgent } from '../agents/IAgent.js';
import { RunConfig } from './RunConfig.js';
import { ISessionService } from '../services/ISessionService.js';
import { IArtifactService } from '../services/IArtifactService.js';
import { IMemoryService } from '../services/IMemoryService.js';
import { ILlmRegistry } from '../llm/ILlmRegistry.js';
import { ICodeExecutor } from '../services/ICodeExecutor.js';
// import { LiveRequestQueue } from '../agents/LiveRequestQueue.js'; // Placeholder for LiveRequestQueue
// import { ActiveStreamingTool } from '../agents/ActiveStreamingTool.js'; // Placeholder

// Placeholder for LiveRequestQueue until defined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LiveRequestQueue = any;

// Placeholder for ActiveStreamingTool map until defined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActiveStreamingToolMap = Record<string, any>; 

/** Defines the structure for services available in the InvocationContext. */
export interface InvocationServices {
  sessionService?: ISessionService;
  artifactService?: IArtifactService;
  memoryService?: IMemoryService;
  llmRegistry?: ILlmRegistry;
  codeExecutor?: ICodeExecutor;
  // Add other services as needed
}


/**
 * Context for a single invocation (run) of an agent or a part of an agent's flow.
 * This object is typically mutable and passed through the execution stack.
 */
export interface InvocationContext {
  /** Unique ID for this specific invocation. */
  invocationId: string;

  /** The session this invocation belongs to. */
  session: Session;

  /** The current agent being executed in this context. */
  agent: IAgent; // This will be the IAgent interface

  /** The parent context if this is a sub-agent invocation. */
  parentContext?: InvocationContext;

  /** The current execution branch for hierarchical agents. */
  branch?: string;

  /** The configuration for the current agent run. */
  runConfig: RunConfig;

  /** Services available to the agent during this invocation. */
  services?: InvocationServices;

  /** The new message that triggered this part of the invocation, if applicable. */
  newMessage?: Content;

  /** Queue for handling requests in live/streaming mode. */
  liveRequestQueue?: LiveRequestQueue;

  /** Tracks active streaming tools for the current invocation. */
  activeStreamingTools?: ActiveStreamingToolMap;

  /** Cache for transcription data during live audio processing. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transcriptionCache?: any[]; // Define TranscriptionEntry later if needed

  /** Flag to indicate if the current invocation or agent turn should end. */
  endInvocation?: boolean;

  /** If an agent transfer is requested, this holds the name of the target agent. */
  transferToAgentName?: string;
  
  /** Any other dynamic data needed during the invocation. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
} 