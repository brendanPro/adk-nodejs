import { InvocationContext } from '../../common/InvocationContext.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { ILlmRequestProcessor } from '../FlowProcessor.js';
import { Event, EventType } from '../../common/Event.js';
import { Content, Part } from '../../models/LlmContent.js';

/**
 * Processor to prepare and add conversation history (contents) from session events to the LLM request.
 */
export class ContentRequestProcessor implements ILlmRequestProcessor {
  async processRequest(request: LlmRequest, context: InvocationContext): Promise<LlmRequest | void> {
    const historyContents: Content[] = [];
    const sessionEvents = context.session?.events || [];

    for (const event of sessionEvents) {
      let contentToAdd: Content | undefined = undefined;

      if (event.data?.content) {
        contentToAdd = { ...event.data.content }; // Clone to avoid modifying original event data

        if (event.type === EventType.MESSAGE) {
          // For MESSAGE events, role is strictly determined by the source.
          // USER source becomes 'user' role, any other source (AGENT, SYSTEM, etc.) becomes 'model'.
          contentToAdd.role = (event.source.type === 'USER') ? 'user' : 'model';
        } else if (event.type === EventType.LLM_RESPONSE) {
          // LLM_RESPONSE content should ideally have role: 'model'.
          // If it's missing for some reason, set it. Otherwise, trust the existing role if it's valid.
          if (!contentToAdd.role || contentToAdd.role !== 'model') {
            contentToAdd.role = 'model';
          }
        } else if (event.type === EventType.TOOL_RESPONSE) {
          // TOOL_RESPONSE content should ideally have role: 'tool'.
          // If it's missing or incorrect, set it.
          if (!contentToAdd.role || contentToAdd.role !== 'tool') {
            contentToAdd.role = 'tool';
          }
        } else {
          // For other event types with content, if a role exists, keep it, otherwise skip.
          if (!contentToAdd.role) {
            contentToAdd = undefined; // Cannot determine role, so skip this content
          }
        }
        
      } else if (event.type === EventType.MESSAGE && typeof event.data?.message === 'string') {
        // Handle simple string messages as user content if no structured content exists
        if (event.source.type === 'USER') {
            contentToAdd = { role: 'user', parts: [{ text: event.data.message }] };
        }
      }

      if (contentToAdd && contentToAdd.role && contentToAdd.parts && contentToAdd.parts.length > 0) {
        historyContents.push(contentToAdd);
      }
    }

    if (historyContents.length > 0) {
      if (!request.contents) {
        request.contents = [];
      }
      // Prepend history to the current request's contents
      // This ensures that the LLM sees the history first, then the current turn's input.
      request.contents = [...historyContents, ...request.contents];
    }
  }
} 