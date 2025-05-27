import { InvocationContext } from '../common/InvocationContext.js';
import { LlmRequest } from '../models/LlmRequest.js';
import { LlmResponse, Candidate } from '../models/LlmResponse.js';
import { Event, EventType, EventActions } from '../common/Event.js';
import { Content, FunctionCall } from '../models/LlmContent.js';
import { IBaseLlm } from '../models/IBaseLlm.js';
import { IBaseLlmFlow } from './IBaseLlmFlow.js';
import { ILlmRequestProcessor, ILlmResponseProcessor } from './FlowProcessor.js';
import { ILlmRegistry } from '../llm/ILlmRegistry.js';
import { LlmRegistry } from '../llm/LlmRegistry.js';

// Type guard to check if an object is an Event
function isEvent(obj: any): obj is Event {
  return obj && typeof obj === 'object' && 'eventId' in obj && 'type' in obj && 'interactionId' in obj;
}

/**
 * Abstract base class for LLM interaction flows.
 * Implements the IBaseLlmFlow interface and provides common processing logic.
 */
export abstract class BaseLlmFlow implements IBaseLlmFlow {
  public requestProcessors: ILlmRequestProcessor[];
  public responseProcessors: ILlmResponseProcessor[];
  public name: string;
  public description?: string;
  protected llmRegistry: ILlmRegistry;

  constructor(
    requestProcessors: ILlmRequestProcessor[] = [],
    responseProcessors: ILlmResponseProcessor[] = [],
    name?: string,
    description?: string,
    llmRegistry?: ILlmRegistry
  ) {
    this.requestProcessors = requestProcessors;
    this.responseProcessors = responseProcessors;
    this.name = name || this.constructor.name; // Default to class name if not provided
    this.description = description;
    this.llmRegistry = llmRegistry || new LlmRegistry();
  }

  async applyRequestProcessors(request: LlmRequest, context: InvocationContext): Promise<LlmRequest> {
    let currentRequest = request;
    for (const processor of this.requestProcessors) {
      const result: LlmRequest | void = await processor.processRequest(currentRequest, context);
      if (result) {
        currentRequest = result;
      }
    }
    return currentRequest;
  }

  async applyResponseProcessors(
    response: LlmResponse, 
    request: LlmRequest, // Original request
    context: InvocationContext
  ): Promise<LlmResponse | Event> {
    let currentResponseOrEvent: LlmResponse | Event | void = response;
    for (const processor of this.responseProcessors) {
      if (typeof currentResponseOrEvent === 'object' && currentResponseOrEvent !== null && 'eventId' in currentResponseOrEvent) {
        // If it's already an Event, just pass it through further processors or return it.
        // Depending on desired behavior, we might break or continue.
        // For now, let's assume an Event means processing for this stage is done by this processor.
        break; 
      }

      // At this point, currentResponseOrEvent should be LlmResponse if not an Event already
      // If a processor could make it void, this cast is unsafe.
      // However, processors are expected to return LlmResponse, Event, or void (modifying in place).
      // If void, the original LlmResponse (currentResponseOrEvent) is used.
      const result: LlmResponse | Event | void = await processor.processResponse(
        currentResponseOrEvent as LlmResponse, 
        request, 
        context
      );
      
      if (result !== undefined && result !== null) { // Check if processor returned something (LlmResponse or Event)
        currentResponseOrEvent = result;
      }
      // If processor returned void (result is undefined/null), currentResponseOrEvent remains unchanged,
      // which is the LlmResponse that was (potentially) modified in-place.
    }

    // At this point, currentResponseOrEvent must be LlmResponse or Event.
    // It cannot be void because it starts as LlmResponse and is only updated to LlmResponse or Event.
    if (currentResponseOrEvent === undefined || currentResponseOrEvent === null) {
        // This case should ideally not be reached if logic is correct and initial `response` is valid.
        // Fallback to original response if something went wrong and it became void/null.
        // This might mask an issue but ensures type compatibility.
        console.warn('BaseLlmFlow.applyResponseProcessors: currentResponseOrEvent became undefined/null unexpectedly. Returning original response.')
        return response; 
    }

    return currentResponseOrEvent as LlmResponse | Event; // Final cast to satisfy the stricter return type
  }

  abstract runLlmInteraction(
    currentLlmRequest: LlmRequest,
    llm: IBaseLlm,
    context: InvocationContext
  ): Promise<Event>;

  /**
   * Utility method to create a basic LlmRequest object.
   * Subclasses or processors will populate its fields.
   */
  public createInitialLlmRequest(modelName: string, context: InvocationContext): LlmRequest {
    const agentName = context.agent?.name || 'unknown_agent'; // Safely access agent name
    return {
      model: modelName,
      contents: [],
      requestId: `${context.invocationId}-${agentName}-${Date.now()}`,
      appName: context.session.appName,
    };
  }

  /**
   * Utility method to select an LLM instance from the registry.
   * @param modelName The desired model name.
   * @param context The invocation context.
   * @returns An IBaseLlm instance.
   * @throws Error if the LLM cannot be found or instantiated.
   */
  public async getLlmInstance(modelName: string, context: InvocationContext): Promise<IBaseLlm> {
    let registryToUse = this.llmRegistry;
    if (context.services?.llmRegistry) {
        registryToUse = context.services.llmRegistry as ILlmRegistry;
    } else if (!registryToUse) {
        console.warn('BaseLlmFlow: LLMRegistry not found in flow or context.services. Creating a new default LlmRegistry.');
        registryToUse = new LlmRegistry();
    }

    const llm = await registryToUse.getLlm(modelName);
    const agentName = context.agent?.name || 'unknown_agent';
    if (!llm) {
      throw new Error(
        `LLM '${modelName}' not found in the active registry for agent '${agentName}'. ` +
        'Ensure it is registered.'
      );
    }
    return llm;
  }

  /**
   * Creates a standard Event from an LlmResponse.
   * This is a basic implementation; specific flows or processors might create more detailed events.
   */
  protected createEventFromLlmResponse(
    llmResponse: LlmResponse,
    llmRequest: LlmRequest,
    context: InvocationContext,
    eventTypeInput: EventType = EventType.LLM_RESPONSE // Renamed for clarity, defaults to LLM_RESPONSE
  ): Event {
    const sourceName = llmResponse.model || llmRequest.model || 'unknown-model';
    // Need to ensure EventData, EventSource, EventSourceType are available.
    // They are imported at the top of the file usually.
    const eventData: import('../common/Event.js').EventData = {};
    let source: import('../common/Event.js').EventSource;
    let effectiveEventType = eventTypeInput;

    if (llmResponse.error) {
      effectiveEventType = EventType.ERROR;
      source = { 
        type: 'SYSTEM' as import('../common/Event.js').EventSourceType, 
        name: this.constructor.name 
      }; 
      eventData.error = {
        message: llmResponse.error.message,
        code: llmResponse.error.code?.toString(),
        details: llmResponse.error.details,
      };
      eventData.content = { parts: [{ text: llmResponse.error.message }] };
    } else {
      // Successful response from LLM
      source = { 
        type: 'LLM' as import('../common/Event.js').EventSourceType, // Corrected from 'MODEL' to 'LLM'
        name: sourceName 
      }; 
      const primaryCandidate = llmResponse.candidates?.[0];
      if (primaryCandidate?.content) {
        eventData.content = primaryCandidate.content;
      }
      // Ensure correct event type for successful LLM response if not a more specific one.
      if (eventTypeInput === EventType.LLM_RESPONSE || eventTypeInput === EventType.MESSAGE) { // If default or generic message
        effectiveEventType = EventType.LLM_RESPONSE;
      }
      // If eventTypeInput was something specific like TOOL_RESPONSE, it will be preserved.
    }
    
    const newEvent: Event = {
        eventId: `${context.invocationId}-${effectiveEventType.toLowerCase().replace(/_/g, '-')}-${Date.now()}`,
        interactionId: context.invocationId,
        sessionId: context.session.id,
        userId: context.session.userId,
        appName: context.session.appName,
        type: effectiveEventType,
        source: source,
        timestamp: new Date(),
        data: eventData,
        llmRequest: llmRequest,
        llmResponse: llmResponse,
      };

    const primaryCandidate = llmResponse.candidates?.[0];
    if (primaryCandidate?.content?.parts) {
        const functionCalls = primaryCandidate.content.parts
            .filter(part => part.functionCall)
            .map(part => part.functionCall as FunctionCall);
        if (functionCalls.length > 0) {
            (newEvent as any).functionCalls = functionCalls; 
        }
    }
    return newEvent;
  }
} 