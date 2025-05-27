import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { ILlmRequestProcessor } from '../FlowProcessor.js';

/**
 * Processor to set up the LLM request for agent transfer capabilities (AutoFlow).
 */
export class AgentTransferRequestProcessor implements ILlmRequestProcessor {
  async processRequest(request: LlmRequest, context: InvocationContext): Promise<LlmRequest | void> {
    // Implement logic from _AgentTransferLlmRequestProcessor
    // - Adds the 'transfer_to_agent' tool declaration to the request
    // - Potentially adds instructions about when to use agent transfer
    console.log('AgentTransferRequestProcessor: Processing request', request, context);
  }
} 