import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { LlmResponse } from '../../models/LlmResponse.js';
import { Event } from '../../common/Event.js';
import { ILlmResponseProcessor } from '../FlowProcessor.js';

/**
 * Processor to handle LLM responses related to planning, 
 * potentially updating plan state or generating plan-related events.
 */
export class PlanningResponseProcessor implements ILlmResponseProcessor {
  async processResponse(
    response: LlmResponse, 
    request: LlmRequest, 
    context: InvocationContext
  ): Promise<LlmResponse | Event | void> {
    // Implement logic from _NLPlanningResponseProcessor
    // - Parse plan updates from LLM response (if any)
    // - Update plan in session state
    // - Potentially create events based on plan status changes
    console.log('PlanningResponseProcessor: Processing response', response, request, context);
  }
} 