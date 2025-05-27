import { InvocationContext } from './InvocationContext.js';
import { SessionState } from './Session.js';
import { Event, EventActions } from './Event.js';

/**
 * Context provided to agent and tool lifecycle callbacks.
 * It provides access to the current invocation context and a way to manage session state changes.
 */
export class CallbackContext {
  public readonly invocationContext: InvocationContext;
  private _eventActions: EventActions;
  private originalStateSnapshot: string; // JSON string of state at the start
  public overrideEvent?: Event; // Added optional overrideEvent property

  constructor(invocationContext: InvocationContext) {
    this.invocationContext = invocationContext;
    this._eventActions = {}; // Initialize empty actions
    this.overrideEvent = undefined; // Initialize as undefined
    // Snapshot the state to detect deltas later. Deep clone is safer.
    try {
      this.originalStateSnapshot = JSON.stringify(this.invocationContext.session.state.getAll());
    } catch (e) {
      // If state is not serializable, this will fail. For now, log and continue.
      console.warn('CallbackContext: Could not serialize initial session state for delta tracking.', e);
      this.originalStateSnapshot = '{}'; // Default to empty object string
    }
  }

  /** Access the underlying session state directly (read-only for safety here, mutations via dedicated methods). */
  get state(): SessionState {
    return this.invocationContext.session.state;
  }

  /** Access the event actions accumulated so far. */
  get actions(): EventActions {
    return this._eventActions;
  }

  /**
   * Signals that the current agent/tool wants to transfer control to another agent.
   * @param agentName The name of the agent to transfer to.
   */
  requestAgentTransfer(agentName: string): void {
    this._eventActions.transferToAgent = agentName;
  }

  /**
   * Signals that a tool requires authentication.
   * @param functionCallId The ID of the original function call that requires auth.
   * @param authConfig The configuration needed for the auth provider or UI.
   */
  requestAuthConfig(functionCallId: string, authConfig: any): void {
    if (!this._eventActions.requestedAuthConfigs) {
      this._eventActions.requestedAuthConfigs = {};
    }
    this._eventActions.requestedAuthConfigs[functionCallId] = authConfig;
  }
  
  /**
   * Calculates the changes made to the session state since the callback context was created.
   * Note: This is a simple JSON diff. For complex objects or frequent calls, consider a more robust delta mechanism.
   * @returns A Record<string, any> representing the changed keys and their new values, or null if no changes.
   */
  getStateDelta(): Record<string, any> | null {
    const currentState = this.invocationContext.session.state.getAll();
    const currentStateJson = JSON.stringify(currentState);

    if (currentStateJson === this.originalStateSnapshot) {
      return null;
    }

    const delta: Record<string, any> = {};
    const originalParsed = JSON.parse(this.originalStateSnapshot);

    for (const key in currentState) {
      if (currentState.hasOwnProperty(key)) {
        if (!originalParsed.hasOwnProperty(key) || JSON.stringify(originalParsed[key]) !== JSON.stringify(currentState[key])) {
          delta[key] = currentState[key];
        }
      }
    }
    // Check for deleted keys
    for (const key in originalParsed) {
      if (originalParsed.hasOwnProperty(key) && !currentState.hasOwnProperty(key)) {
        delta[key] = undefined; // Or a special marker for deletion
      }
    }
    return Object.keys(delta).length > 0 ? delta : null;
  }
} 