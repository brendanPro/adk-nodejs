import { LlmRequest } from '../../models/LlmRequest.js';
import { InvocationContext } from '../../common/InvocationContext.js';
import { ILlmRequestProcessor } from '../FlowProcessor.js';
import { Event, EventType } from '../../common/Event.js';
import { Content } from '../../models/LlmContent.js';

/**
 * Prepends conversation history to the LLM request.
 */
export class HistoryRequestProcessor implements ILlmRequestProcessor {
  private maxTurns: number;

  constructor(config?: { maxTurns?: number }) {
    this.maxTurns = config?.maxTurns === undefined ? 10 : config.maxTurns; // Default to 10 turns, 0 for no limit (or handle differently)
  }

  async processRequest(request: LlmRequest, context: InvocationContext): Promise<LlmRequest | void> {
    const historyContents: Content[] = [];
    const sessionEvents = context.session?.events || [];

    // Filter relevant events and take up to maxTurns
    // We want LLM_RESPONSE (model replies), user MESSAGE events, and TOOL_RESPONSE events.
    const relevantEventTypes = [EventType.MESSAGE, EventType.LLM_RESPONSE, EventType.TOOL_RESPONSE];
    const filteredEvents = sessionEvents
        .filter(event => relevantEventTypes.includes(event.type))
        .slice(- (this.maxTurns > 0 ? this.maxTurns * 2 : sessionEvents.length)); // Approximation: *2 for req/resp pairs, take more if maxTurns=0

    for (const event of filteredEvents) {
      let contentToAdd: Content | undefined = undefined;

      if (event.type === EventType.MESSAGE && event.data?.content) {
        const role = event.source.type === 'USER' ? 'user' : 'model'; // Default role based on source
        contentToAdd = {
            ...event.data.content,
            role: event.data.content.role || role,
        };
      } else if (event.type === EventType.LLM_RESPONSE && event.data?.content) {
        // LLM_RESPONSE event.data.content should already have role: 'model'
        contentToAdd = event.data.content;
      } else if (event.type === EventType.TOOL_RESPONSE && event.data?.content) {
        // TOOL_RESPONSE event.data.content should have role: 'tool' and parts with functionResponse
        contentToAdd = event.data.content; 
      }

      if (contentToAdd) {
        // Ensure content has a valid role before adding to history
        if (!contentToAdd.role) {
            // This is a fallback, ideally content should always have a role from its source event
            if (event.type === EventType.MESSAGE && event.source.type === 'USER') contentToAdd.role = 'user';
            else if (event.type === EventType.LLM_RESPONSE) contentToAdd.role = 'model';
            else if (event.type === EventType.TOOL_RESPONSE) contentToAdd.role = 'tool';
            else contentToAdd.role = 'user'; // Default fallback
        }
        historyContents.push(contentToAdd);
      }
    }
    
    // The events were processed in chronological order, so historyContents is also chronological.
    // If maxTurns is applied, it effectively takes the last N turns (pairs or individual messages).
    // We need to ensure the order is correct for the LLM (typically oldest to newest).
    // The slice logic for filteredEvents was a bit off for turn counting. Let's simplify:
    // We want the last `this.maxTurns` of (user message, model response with optional tool calls/responses) interaction blocks.
    // For simplicity now, we will just take the last N relevant content pieces.
    // The `slice` above already limits the number of *events*. The loop then extracts *content*.

    const finalHistory = this.maxTurns > 0 ? historyContents.slice(-this.maxTurns) : historyContents;

    if (finalHistory.length > 0) {
        if (!request.contents) {
            request.contents = [];
        }
        // Prepend history to the current request's contents
        request.contents = [...finalHistory, ...request.contents];
    }
  }
} 