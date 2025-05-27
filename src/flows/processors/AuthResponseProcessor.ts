import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { LlmResponse } from '../../models/LlmResponse.js';
import { Event, EventActions } from '../../common/Event.js';
import { ILlmResponseProcessor } from '../FlowProcessor.js';

/**
 * Processor to handle the results of an authentication flow triggered by a tool.
 * In Python, this was _AuthLlmRequestProcessor, but it acts on the *result*
 * of a tool asking for auth, so it's more like a response processor stage before
 * the next actual LLM call.
 */
export class AuthResponseProcessor implements ILlmResponseProcessor {
  async processResponse(
    response: LlmResponse, // This might be a synthetic response if coming from tool auth directly
    request: LlmRequest, 
    context: InvocationContext
  ): Promise<LlmResponse | Event | void> {
    // Implement logic from _AuthLlmRequestProcessor / functions.generate_tool_auth_event
    // - This processor is likely called after a tool signals `requested_auth_configs`.
    // - It would check `context.session.state.get('_requested_auth_configs')`
    // - If auth configs are present, it might:
    //   - Update the LlmRequest with auth tokens if available (e.g., from session state after user auth)
    //   - Or, if auth is still pending, it might have already generated an Event to signal the UI.
    //   - This processor ensures the next LLM call is correctly set up post-auth attempt.
    // console.log('AuthResponseProcessor: Processing response/auth data', response, request, context);

    const requestedAuthConfigs = context.session.state.get<Record<string, any>>('_requested_auth_configs');
    if (requestedAuthConfigs && Object.keys(requestedAuthConfigs).length > 0) {
      // Logic to handle acquired tokens or re-prompt for auth will go here.
      // For now, we assume tokens might be in session state, or this step prepares
      // the next request to re-try tools that needed auth.
      
      // Clear the flag from session state as it's being processed.
      context.session.state.delete('_requested_auth_configs');
      
      // Potentially modify the request to include new auth headers/tokens for specific tools
      // or re-prepare function responses if tools were deferred.
    }
  }
} 