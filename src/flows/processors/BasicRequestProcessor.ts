import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { ILlmRequestProcessor } from '../FlowProcessor.js';

/**
 * Basic request processor, e.g., for type checking current event.
 */
export class BasicRequestProcessor implements ILlmRequestProcessor {
  async processRequest(request: LlmRequest, context: InvocationContext): Promise<LlmRequest | void> {
    // Implement logic from _BasicLlmRequestProcessor
    // - Check event type (e.g., if it's a Message)
    // console.log('BasicRequestProcessor: Processing request', request, context);
    // For now, does nothing to the request itself
  }
} 