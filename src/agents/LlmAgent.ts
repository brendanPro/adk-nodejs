import { InvocationContext } from '../common/InvocationContext.js';
import { Event, EventType, EventSource } from '../common/Event.js';
import { Content } from '../models/LlmContent.js';
import { LlmRequest } from '../models/LlmRequest.js';
import { BaseAgent } from './BaseAgent.js';
import { IAgent } from './IAgent.js';
import { LlmAgentConfig } from './LlmAgentConfig.js';
import { IToolset } from '../tools/IToolset.js';
import { IBaseLlmFlow } from '../flows/IBaseLlmFlow.js';
import { SingleFlow } from '../flows/SingleFlow.js'; // Default flow
import { BeforeAgentCallback, AfterAgentCallback } from './AgentCallbacks.js';
import { CallbackContext } from '../common/CallbackContext.js'; // For callbacks
import { v4 as uuidv4 } from 'uuid'; // For event IDs

export interface LlmAgentProps {
  name: string;
  description: string;
  llmConfig?: LlmAgentConfig;
  toolset?: IToolset;
  flow?: IBaseLlmFlow;
  subAgents?: IAgent[];
  beforeAgentCallback?: BeforeAgentCallback | BeforeAgentCallback[];
  afterAgentCallback?: AfterAgentCallback | AfterAgentCallback[];
}

/**
 * An agent that interacts with an LLM, using a configurable flow and processors.
 */
export class LlmAgent extends BaseAgent {
  // Override flow to be non-abstract and have a default
  protected flow: IBaseLlmFlow;
  // No direct llm property; it's resolved via flow or context.runConfig.llm
  // No direct memory property; it's resolved via context.runConfig.memoryService

  constructor(props: LlmAgentProps) {
    super(props); // BaseAgent constructor handles props.name, props.description, props.llmConfig, props.toolset etc.
    this.flow = props.flow || new SingleFlow(); // Default to SingleFlow if not provided
    // this.toolset is already set by super(props) if props.toolset was provided to LlmAgent

    // Assign agent's toolset to flow if flow doesn't have one and agent has one.
    if (this.toolset && this.flow && !(this.flow as any).toolset) {
        // This allows LlmAgent to provide a default toolset to a flow that can accept one.
        (this.flow as any).toolset = this.toolset;
    } 
    // If props.flow already had a toolset, it keeps it (priority to flow's own toolset).
    // If this.toolset (from agent's props) is undefined, nothing is assigned to flow's toolset.
  }

  /**
   * Creates the initial LlmRequest for this agent's turn.
   */
  protected getInitialLlmRequest(context: InvocationContext): LlmRequest {
    const resolvedModelName = this.llmConfig?.modelName || context.runConfig?.defaultModelName || 'default-model';
    
    // Warn if using fallback model name and it wasn't explicitly set
    if (resolvedModelName === 'default-model' && 
        !this.llmConfig?.modelName && 
        !context.runConfig?.defaultModelName) {
        // console.warn(`LlmAgent '${this.name}': Model name is not configured. Using placeholder 'default-model'.`);
    }
    
    const initialRequest = this.flow.createInitialLlmRequest(resolvedModelName, context);
    // Ensure the model name resolved by the agent is set on the final request object
    initialRequest.model = resolvedModelName;

    // Apply agent-specific LLM configurations to the request
    if (this.llmConfig) {
      if (this.llmConfig.generationConfig) {
        initialRequest.generationConfig = {
          ...initialRequest.generationConfig,
          ...this.llmConfig.generationConfig,
        };
      }
      if (this.llmConfig.safetySettings) {
        initialRequest.safetySettings = [
          ...(initialRequest.safetySettings || []),
          ...this.llmConfig.safetySettings,
        ];
      }
      if (this.llmConfig.tools) {
        initialRequest.tools = [
          ...(initialRequest.tools || []),
          ...this.llmConfig.tools,
        ];
      }
      if (this.llmConfig.toolConfig) {
        const flowToolConfig = initialRequest.toolConfig; // Preserve flow's original toolConfig

        initialRequest.toolConfig = {
            ...(flowToolConfig || {}),
            ...this.llmConfig.toolConfig, // Agent's general toolConfig (e.g., top-level mode) overrides flow's
        };

        // Deeper merge for functionCallingConfig if agent specified it
        if (this.llmConfig.toolConfig.functionCallingConfig) {
            initialRequest.toolConfig.functionCallingConfig = {
                ...(flowToolConfig?.functionCallingConfig || {}), // Base: Flow's original FCC attributes
                ...this.llmConfig.toolConfig.functionCallingConfig, // Override with Agent's FCC attributes
            };
        } 
        // If agent's llmConfig.toolConfig did not have functionCallingConfig, but flowToolConfig did,
        // it would have been preserved by the first spread `...(flowToolConfig || {})`,
        // unless this.llmConfig.toolConfig *explicitly* had `functionCallingConfig: undefined` which would clear it.
        // The current logic ensures agent's FCC parts override flow's FCC parts if agent provides FCC.
      }
      // System instructions are typically handled by a dedicated request processor (e.g., InstructionsRequestProcessor)
      // which would use this.llmConfig.systemInstruction or a direct system message.
      // getInitialLlmRequest itself primarily focuses on merging structured LLM parameters.
      if (this.llmConfig.systemInstruction) {
        // This ensures systemInstruction from llmConfig is on the request if present.
        // The InstructionsRequestProcessor would then format this into Content parts if needed.
        initialRequest.systemInstruction = this.llmConfig.systemInstruction;
      }
    }
    return initialRequest;
  }

  /**
   * Core turn processing logic for the LlmAgent.
   * This involves preparing a request, running it through the configured flow,
   * and yielding events, returning the final outcome from the flow.
   */
  protected async *runLlmTurn(currentContext: InvocationContext): AsyncGenerator<Event, Event | void, undefined> {
    if (!this.flow) {
      const errMessage = `Agent '${this.name}' does not have a flow configured.`;
      const errorEvent = this.createAgentErrorEvent(currentContext, errMessage);
      currentContext.session.events.push(errorEvent);
      yield errorEvent;
      return errorEvent;
    }

    const initialLlmRequest = this.getInitialLlmRequest(currentContext);
    currentContext.session.state.set('_currentLlmRequest', initialLlmRequest);

    const llmRequestEvent: Event = {
      eventId: `${currentContext.invocationId}-llm-request-${this.name}-${uuidv4()}`,
      interactionId: currentContext.invocationId,
      sessionId: currentContext.session.id,
      userId: currentContext.session.userId,
      appName: currentContext.session.appName,
      type: EventType.LLM_REQUEST,
      source: { type: 'AGENT', name: this.name },
      timestamp: new Date(),
      llmRequest: initialLlmRequest,
    };
    currentContext.session.events.push(llmRequestEvent);
    yield llmRequestEvent;

    const llm = await this.flow.getLlmInstance(initialLlmRequest.model, currentContext);
    let flowEventOutcome: Event | void = undefined;

    try {
      // Track events that were in the session before the flow runs
      const eventsBeforeFlow = [...currentContext.session.events];
      
      const eventFromFlow = await this.flow.runLlmInteraction(initialLlmRequest, llm, currentContext);
      
      // Yield any new events that were added to the session during flow execution
      const newEventsFromFlow = currentContext.session.events.filter(
        e => !eventsBeforeFlow.find(existing => existing.eventId === e.eventId)
      );
      for (const newEvent of newEventsFromFlow) {
        yield newEvent;
      }
      
      if (eventFromFlow && !currentContext.session.events.find(e => e.eventId === eventFromFlow.eventId)) {
        currentContext.session.events.push(eventFromFlow);
      }
      if (eventFromFlow) {
        yield eventFromFlow;
      }
      flowEventOutcome = eventFromFlow;
    } catch (flowError: any) {
      const errMessage = `Flow '${this.flow.name}' failed during runLlmInteraction: ${flowError.message}`;
      const errorEvent = this.createAgentErrorEvent(currentContext, errMessage, flowError);
      if (!currentContext.session.events.find(e => e.eventId === errorEvent.eventId)) {
        currentContext.session.events.push(errorEvent);
      }
      yield errorEvent;
      return errorEvent;
    }
    
    if (flowEventOutcome?.actions?.transferToAgent) {
      const targetAgentName = flowEventOutcome.actions.transferToAgent;
      const targetAgent = this.getRootAgent().findAgent(targetAgentName);
      let transferEventToYieldAndReturn: Event;

      if (targetAgent && targetAgent !== this) {
        transferEventToYieldAndReturn = {
            eventId: `${currentContext.invocationId}-transfer-out-${this.name}-${uuidv4()}`,
            interactionId: currentContext.invocationId,
            sessionId: currentContext.session.id,
            userId: currentContext.session.userId,
            appName: currentContext.session.appName,
            type: EventType.AGENT_TRANSFER,
            source: { type: 'AGENT', name: this.name },
            timestamp: new Date(),
            data: { 
                message: `Transferring from ${this.name} to ${targetAgentName}`,
                transferInfo: { targetAgent: targetAgentName, reason: `Transfer from ${this.name}` }
            },
            actions: { transferToAgent: targetAgentName } 
        };
      } else if (targetAgent === this) {
        return flowEventOutcome; 
      } else {
        const errorMessage = `Failed to transfer: Target agent '${targetAgentName}' not found.`;
        transferEventToYieldAndReturn = this.createAgentErrorEvent(currentContext, errorMessage, { targetAgentName });
      }
      if (!currentContext.session.events.find(e => e.eventId === transferEventToYieldAndReturn.eventId)) {
         currentContext.session.events.push(transferEventToYieldAndReturn);
      }
      yield transferEventToYieldAndReturn;
      return transferEventToYieldAndReturn; 
    }
    return flowEventOutcome; 
  }

  /**
   * Overrides BaseAgent's runAsync to incorporate the LLM turn.
   */
  async *runAsync(parentContext: InvocationContext): AsyncGenerator<Event, Event | void, undefined> {
    const invocationId = parentContext.invocationId;
    const currentContext = this.createInvocationContext(parentContext, parentContext.session, parentContext.runConfig);

    const startEvent: Event = {
      eventId: `${invocationId}-start-${this.name}-${uuidv4()}`,
      interactionId: invocationId,
      sessionId: currentContext.session.id,
      userId: currentContext.session.userId,
      appName: currentContext.session.appName,
      type: EventType.INVOCATION_START,
      source: { type: 'AGENT', name: this.name } as EventSource,
      timestamp: new Date(),
      data: { message: `LlmAgent ${this.name} starting.` }
    };
    currentContext.session.events.push(startEvent);
    yield startEvent;
    
    let finalEvent: Event | void = undefined;

    try {
      if (this.beforeAgentCallback) {
        const callbacks = Array.isArray(this.beforeAgentCallback) ? this.beforeAgentCallback : [this.beforeAgentCallback];
        const cbContext = new CallbackContext(currentContext);
        for (const cb of callbacks) {
          if (typeof cb === 'function') { await cb(cbContext); }
        }
      }

      finalEvent = yield* this.runLlmTurn(currentContext);

      if (this.afterAgentCallback) {
        const callbacks = Array.isArray(this.afterAgentCallback) ? this.afterAgentCallback : [this.afterAgentCallback];
        const cbContext = new CallbackContext(currentContext);
        for (const cb of callbacks) {
          if (typeof cb === 'function') { await cb(cbContext); }
        }
        if (cbContext.overrideEvent) {
            const overridden = cbContext.overrideEvent;
            if (!currentContext.session.events.find(e => e.eventId === overridden.eventId)) {
                currentContext.session.events.push(overridden);
            }
            // Yield the override event only if it's different from what runLlmTurn returned (finalEvent)
            if (finalEvent?.eventId !== overridden.eventId) {
                 yield overridden;
            }
            finalEvent = overridden;
        }
      }
    } catch (error: any) {
      const errorEvent = this.createAgentErrorEvent(currentContext, `LlmAgent ${this.name} error: ${error.message}`, error);
      if (!currentContext.session.events.find(e => e.eventId === errorEvent.eventId)) {
        currentContext.session.events.push(errorEvent);
      }
      yield errorEvent;
      finalEvent = errorEvent;
    }

    const endEvent: Event = {
      eventId: `${invocationId}-end-${this.name}-${uuidv4()}`,
      interactionId: invocationId,
      sessionId: currentContext.session.id,
      userId: currentContext.session.userId,
      appName: currentContext.session.appName,
      type: EventType.INVOCATION_END,
      source: { type: 'AGENT', name: this.name } as EventSource,
      timestamp: new Date(),
      data: { message: `LlmAgent ${this.name} ending.` }
    };
    if (!currentContext.session.events.find(e => e.eventId === endEvent.eventId)) {
        currentContext.session.events.push(endEvent);
    }
    // Yield INVOCATION_END only if it's not the same as the finalEvent already determined.
    // (e.g., if finalEvent was an error or an agent transfer that occurred before INVOCATION_END)
    if (finalEvent?.eventId !== endEvent.eventId) {
        yield endEvent;
    }
    
    // The return value of the generator is the most significant event that concluded the agent's run.
    return finalEvent || endEvent; 
  }

  private createAgentErrorEvent(context: InvocationContext, message: string, details?: any): Event {
    return {
        eventId: `${context.invocationId}-error-${this.name}-${uuidv4()}`,
        interactionId: context.invocationId,
        sessionId: context.session.id,
        userId: context.session.userId,
        appName: context.session.appName,
        type: EventType.ERROR,
        source: { type: 'AGENT', name: this.name } as EventSource,
        timestamp: new Date(),
        data: { 
            message: message,
            content: { parts: [{text: message}] }, // For quick display
            error: { message: message, details: details || (details instanceof Error ? details.stack : undefined) }
        }
    };
  }
} 