import { InvocationContext } from '../common/InvocationContext.js';
import { Event } from '../common/Event.js';
import { Content } from '../models/LlmContent.js'; // Re-using Content from Event.ts
import { BeforeAgentCallback, AfterAgentCallback } from './AgentCallbacks.js';
import { LlmAgentConfig } from './LlmAgentConfig.js'; // Import LlmAgentConfig
import { IToolset } from '../tools/IToolset.js'; // For agent.toolset

/**
 * Base interface for all agents in the Agent Development Kit.
 */
export interface IAgent {
  /** The agent's name. Must be unique within an agent tree. */
  name: string;

  /** Description about the agent's capability. Used by LLMs for delegation. */
  description: string;

  /** Optional LLM-specific configurations for this agent. */
  llmConfig?: LlmAgentConfig;

  /** Optional toolset for this agent. */
  toolset?: IToolset;

  /** The parent agent of this agent in a hierarchical structure. */
  parentAgent?: IAgent;

  /** Sub-agents of this agent. */
  subAgents: IAgent[];

  /** Callbacks invoked before the agent's primary run logic. */
  beforeAgentCallback?: BeforeAgentCallback | BeforeAgentCallback[];

  /** Callbacks invoked after the agent's primary run logic. */
  afterAgentCallback?: AfterAgentCallback | AfterAgentCallback[];

  /**
   * Entry method to run an agent, streaming events as they occur.
   * The agent is responsible for managing its own internal event loop if necessary,
   * and should add all relevant events to `context.session.events`.
   * It should yield events during its execution and return a final summary event (or void)
   * upon completion.
   *
   * @param context The invocation context from the parent agent or runner.
   * @returns An async generator that yields Event objects and returns a final Event (or void) summarizing the agent's execution.
   */
  runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined>;

  /**
   * Finds an agent by name within this agent and its descendants.
   * @param name The name of the agent to find.
   * @returns The found IAgent instance or undefined.
   */
  findAgent(name: string): IAgent | undefined;

  /**
   * Gets the root agent of this agent's tree.
   * @returns The root IAgent instance.
   */
  getRootAgent(): IAgent;
  
  // Pydantic model_post_init logic for setting parentAgent on sub_agents 
  // will be handled in the BaseAgent class constructor or an init method.
} 