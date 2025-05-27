import { Event } from './common/Event.js';
import { InvocationContext } from './common/InvocationContext.js';
import { RunConfig, RunOutput } from './common/RunConfig.js';
import { Session } from './common/Session.js';
// import { IAgent } from './agents/IAgent.js';
// import { IArtifactService } from '../services/IArtifactService.js'; 
// import { ISessionService } from '../services/ISessionService.js'; 
// import { IMemoryService } from '../services/IMemoryService.js';   

/**
 * Interface for an Agent Runner.
 * Defines the contract for executing an agent and managing its lifecycle.
 */
export interface IRunner {
  /**
   * Runs an agent based on the provided configuration, streaming events as they occur.
   * This method is responsible for session management, context creation, agent resolution, and invocation.
   *
   * @param runConfig Configuration for this specific run, including agent details and input.
   * @returns An async generator that yields Event objects and returns a RunOutput object upon completion.
   */
  runAgent(runConfig: RunConfig): AsyncGenerator<Event, RunOutput, undefined>;

  /**
   * Performs any necessary cleanup or resource release for the runner and its services.
   * This is optional.
   */
  close?(): Promise<void>;
} 