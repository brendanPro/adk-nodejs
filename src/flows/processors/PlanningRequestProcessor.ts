import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { ILlmRequestProcessor } from '../FlowProcessor.js';

/**
 * Processor to include planning tools and instructions in the LLM request.
 */
export class PlanningRequestProcessor implements ILlmRequestProcessor {
  async processRequest(request: LlmRequest, context: InvocationContext): Promise<LlmRequest | void> {
    // Implement logic from _NLPlanningRequestProcessor
    // - Add planning-related tools (e.g., create_plan, update_task_status)
    // - Add instructions about planning
    console.log('PlanningRequestProcessor: Processing request', request, context);
  }
} 