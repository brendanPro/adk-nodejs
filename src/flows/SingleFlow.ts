import { InvocationContext } from '../common/InvocationContext.js';
import { LlmRequest } from '../models/LlmRequest.js';
import { LlmResponse } from '../models/LlmResponse.js';
import { Event, EventType } from '../common/Event.js';
import { IBaseLlm } from '../models/IBaseLlm.js';
import { BaseLlmFlow } from './BaseLlmFlow.js';
import { ILlmRequestProcessor, ILlmResponseProcessor } from './FlowProcessor.js';
import { ILlmRegistry } from '../llm/ILlmRegistry.js';
import {
  BasicRequestProcessor,
  InstructionsRequestProcessor,
  ContentRequestProcessor,
  FunctionRequestProcessor,
  FunctionResponseProcessor,
  CodeExecutionRequestProcessor,
  CodeExecutionResponseProcessor,
  AuthResponseProcessor, // Handles auth resolution after tool calls
} from './processors/index.js';

/**
 * SingleFlow orchestrates a single request-response cycle with an LLM,
 * including processing for tools (functions).
 */
export class SingleFlow extends BaseLlmFlow {
  constructor(
    requestProcessors?: ILlmRequestProcessor[],
    responseProcessors?: ILlmResponseProcessor[],
    llmRegistry?: ILlmRegistry
  ) {
    // Define default processors for SingleFlow if not provided
    const defaultRequestProcessors: ILlmRequestProcessor[] = [
      new BasicRequestProcessor(),
      new InstructionsRequestProcessor(),
      new ContentRequestProcessor(),
      new FunctionRequestProcessor(),
      new CodeExecutionRequestProcessor(),
    ];

    const defaultResponseProcessors: ILlmResponseProcessor[] = [
      new FunctionResponseProcessor(), // Handles tool execution and auth requests
      new AuthResponseProcessor(),     // Handles results of auth flow
      new CodeExecutionResponseProcessor(),
    ];

    super(
      requestProcessors || defaultRequestProcessors,
      responseProcessors || defaultResponseProcessors,
      undefined, // name for BaseLlmFlow, SingleFlow doesn't set one by default here
      undefined, // description for BaseLlmFlow
      llmRegistry
    );
  }

  async runLlmInteraction(
    initialLlmRequest: LlmRequest,
    llm: IBaseLlm,
    context: InvocationContext
  ): Promise<Event> {
    let currentRequest = initialLlmRequest;
    let llmResponse: LlmResponse | undefined;
    let interactionCount = 0;
    const MAX_INTERACTIONS = 5; // Max tool/function call iterations within a single runLlmInteraction call

    try {
      currentRequest = await this.applyRequestProcessors(currentRequest, context);

      while (interactionCount < MAX_INTERACTIONS) {
        interactionCount++;
        const currentTurnLlmResponse = await llm.generateContentAsync(currentRequest);
        llmResponse = currentTurnLlmResponse; // Store the latest response
        context.session.state.set('_lastLlmResponse', llmResponse); // Storing for potential use by processors

        // Create and store LLM_RESPONSE event for each LLM call
        const llmResponseEvent = this.createEventFromLlmResponse(currentTurnLlmResponse, currentRequest, context);
        if (!context.session.events.find(e => e.eventId === llmResponseEvent.eventId)) {
          context.session.events.push(llmResponseEvent);
        }

        // Apply response processors. This might result in an Event (e.g. tool executed and flow ends)
        // or it might modify context.session.state to indicate a re-run is needed (e.g. with tool results)
        const processedResult = await this.applyResponseProcessors(currentTurnLlmResponse, currentRequest, context);

        if (isEvent(processedResult)) {
          return processedResult; // A processor returned a terminal event
        }

        // Check if a re-run with new tool results is required
        const requiresRerun = context.session.state.get('_requires_llm_rerun_with_tool_results');
        if (requiresRerun) {
            currentRequest = context.session.state.get('_current_llm_request_with_tool_results') || currentRequest;
            context.session.state.delete('_requires_llm_rerun_with_tool_results');
            context.session.state.delete('_current_llm_request_with_tool_results');
            // Loop back to call LLM with the updated request
        } else {
            break; // No re-run needed, exit loop
        }
      }

      if (interactionCount >= MAX_INTERACTIONS) {
        const maxInteractionsErrorResponse: LlmResponse = {
            model: currentRequest.model || llmResponse?.model || 'unknown-interaction-model',
            candidates: [], 
            error: { 
                code: 500, 
                message: 'Max interactions reached' 
            }
        };
        return this.createEventFromLlmResponse(
            maxInteractionsErrorResponse,
            currentRequest, 
            context, 
            EventType.ERROR
        );
      }

      if (!llmResponse) {
        // Should not happen if loop executed at least once and didn't throw/return early
        throw new Error('LLM response is unexpectedly undefined after interaction loop.');
      }
      // If loop finished without re-run, the last llmResponse is the final one
      return this.createEventFromLlmResponse(llmResponse, currentRequest, context);

    } catch (error: any) {
      // Generic error handling for issues during processing or LLM call
      const errorLlmResponse: LlmResponse = {
        model: currentRequest.model || 'unknown-error-model', // Use current request model or a default
        candidates: [],
        error: {
          code: error.code || 500,
          message: error.message || 'Flow execution error',
          details: error.stack,
        },
      };
      return this.createEventFromLlmResponse(
        errorLlmResponse,
        currentRequest,
        context,
        EventType.ERROR
      );
    }
  }
}

// Helper type guard (could be moved to a common utils file)
function isEvent(obj: any): obj is Event {
  return obj && typeof obj === 'object' && 'eventId' in obj && 'type' in obj && 'interactionId' in obj;
} 