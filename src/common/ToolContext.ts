import { SessionState } from './Session.js';
import { EventActions } from './Event.js';
import { InvocationContext } from './InvocationContext.js';
import { IAgent } from '../agents/IAgent.js'; // Required for agent.name access

/**
 * Provides context to a tool during its execution.
 */
export interface ToolContext {
  /** The ID of the overarching invocation. */
  readonly invocationId: string;

  /** The ID of the specific function call that triggered this tool. */
  readonly functionCallId: string; 

  /** The name of the agent that is currently invoking the tool. */
  readonly agentName: string;

  /** 
   * Provides access to the session state. Tools can read from and write to this state.
   * Mutations to this state will be persisted in the main session.
   */
  readonly sessionState: SessionState;

  /** 
   * Actions that the tool can request (e.g., agent transfer, auth requests).
   * These actions will be collected and processed by the flow after the tool executes.
   */
  readonly actions: EventActions;

  /** Provides access to the broader invocation context if needed, for more advanced scenarios. */
  readonly invocationContext?: InvocationContext; // Optional, to keep ToolContext lean by default
}

/**
 * Creates a ToolContext instance.
 * @param invocationContext The current invocation context.
 * @param functionCallId The ID of the function call triggering the tool.
 * @returns A ToolContext object.
 */
export function createToolContext(
  invocationContext: InvocationContext,
  functionCallId: string
): ToolContext {
  const currentEventActions: EventActions = {}; 

  // Ensure agent has a name property. This should be enforced by IAgent definition later.
  const agentName = (invocationContext.agent as IAgent & { name: string }).name || 'unknown_agent';

  return {
    invocationId: invocationContext.invocationId,
    functionCallId,
    agentName: agentName,
    sessionState: invocationContext.session.state,
    actions: currentEventActions,
    invocationContext: invocationContext, 
  };
} 