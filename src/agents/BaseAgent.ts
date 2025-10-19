import { InvocationContext } from '../common/InvocationContext.js';
import { Event, EventType } from '../common/Event.js';
import { Content } from '../models/LlmContent.js';
import { Session } from '../common/Session.js';
import { RunConfig } from '../common/RunConfig.js';
import { IAgent } from './IAgent.js';
import { BeforeAgentCallback, AfterAgentCallback } from './AgentCallbacks.js';
import { LlmAgentConfig } from './LlmAgentConfig.js';
import { IToolset } from '../tools/IToolset.js';
import { IBaseLlmFlow } from '../flows/IBaseLlmFlow.js'; // Agents will use flows
import { LlmRequest } from '../models/LlmRequest.js'; // Added LlmRequest import

/**
 * Abstract base class for agents, providing common functionality.
 * Implements the IAgent interface.
 */
export abstract class BaseAgent implements IAgent {
  name: string;
  description: string;
  llmConfig?: LlmAgentConfig;
  toolset?: IToolset;
  parentAgent?: IAgent;
  subAgents: IAgent[];
  beforeAgentCallback?: BeforeAgentCallback | BeforeAgentCallback[];
  afterAgentCallback?: AfterAgentCallback | AfterAgentCallback[];

  // The specific flow an agent uses (e.g., SingleFlow, AutoFlow)
  // This will be set by concrete agent implementations (like LlmAgent).
  protected abstract flow?: IBaseLlmFlow;

  constructor(props: {
    name: string;
    description: string;
    llmConfig?: LlmAgentConfig;
    toolset?: IToolset;
    subAgents?: IAgent[];
    beforeAgentCallback?: BeforeAgentCallback | BeforeAgentCallback[];
    afterAgentCallback?: AfterAgentCallback | AfterAgentCallback[];
    // parentAgent is set via addSubAgent or when a subAgent is passed in constructor
  }) {
    this.name = props.name;
    this.description = props.description;
    this.llmConfig = props.llmConfig;
    this.toolset = props.toolset;
    this.subAgents = [];
    if (props.subAgents) {
      props.subAgents.forEach(subAgent => this.addSubAgent(subAgent));
    }
    this.beforeAgentCallback = props.beforeAgentCallback;
    this.afterAgentCallback = props.afterAgentCallback;
  }

  protected addSubAgent(subAgent: IAgent): void {
    if (this.findAgent(subAgent.name)) {
      throw new Error(
        `Sub-agent with name '${subAgent.name}' already exists in agent '${this.name}'.`
      );
    }
    subAgent.parentAgent = this;
    this.subAgents.push(subAgent);
  }

  findAgent(name: string): IAgent | undefined {
    if (this.name === name) {
      return this;
    }
    for (const subAgent of this.subAgents) {
      const found = subAgent.findAgent(name);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  getRootAgent(): IAgent {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: IAgent = this;
    while (current.parentAgent) {
      current = current.parentAgent;
    }
    return current;
  }

  /**
   * Creates the InvocationContext for this agent's run.
   * @param parentContext The context from the parent, if any.
   * @param session The current session.
   * @param runConfigParam The run configuration.
   * @returns A new InvocationContext.
   */
  protected createInvocationContext(
    parentContext: InvocationContext | null, 
    session: Session, 
    runConfigParam?: RunConfig // Renamed for clarity
  ): InvocationContext {
    const resolvedRunConfig = runConfigParam || parentContext?.runConfig;
    if (!resolvedRunConfig) {
      // This case should ideally not be reached if Runner always supplies a RunConfig
      // and agents propagate it correctly.
      throw new Error('BaseAgent: Cannot create InvocationContext without a valid RunConfig.');
    }
    // Ensure the resolvedRunConfig actually has the required fields.
    // This is more of a runtime check if TypeScript doesn't catch an invalid {} being passed.
    if (!resolvedRunConfig.agentName || typeof resolvedRunConfig.input === 'undefined') {
        throw new Error('BaseAgent: RunConfig provided to createInvocationContext is missing required fields (agentName or input).');
    }

    return {
      invocationId: parentContext?.invocationId || `${this.name}-${Date.now()}`,
      agent: this,
      parentContext: parentContext || undefined,
      session: session,
      runConfig: resolvedRunConfig, // Now guaranteed to be a valid RunConfig
      services: parentContext?.services, // Preserve services from parent context
      // liveRequestQueue and activeStreamingTools would be initialized if used
    };
  }

  /**
   * Abstract method to be implemented by concrete agents to get the initial LLM request.
   * For an LlmAgent, this would typically involve getting the model name from llmConfig.
   */
  protected abstract getInitialLlmRequest(context: InvocationContext): LlmRequest;

  // Main run logic - must be implemented by concrete agent types.
  abstract runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined>;

  // runLive has been removed from IAgent and is removed here too.
} 