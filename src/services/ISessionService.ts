import { Session, SessionState } from '../common/Session.js';
import { Event } from '../common/Event.js';

/**
 * Interface for managing user sessions.
 */
export interface ISessionService {
  /**
   * Retrieves an existing session.
   * @param sessionId The ID of the session.
   * @returns The Session object, or null if not found.
   */
  getSession(sessionId: string): Promise<Session | null>;

  /**
   * Creates a new session explicitly.
   * @param userId The ID of the user.
   * @param appName The name of the application.
   * @param initialState Optional initial state for the session.
   * @param initialEvents Optional initial events for the session.
   * @returns The newly created Session object.
   */
  createSession(
    userId: string,
    appName: string,
    initialState?: SessionState,
    initialEvents?: Event[],
  ): Promise<Session>;

  /**
   * Appends an event to a session's event history.
   * @param sessionId The ID of the session to append the event to.
   * @param event The event to append.
   * @returns The updated Session object or null if session not found.
   */
  appendEvent(sessionId: string, event: Event): Promise<Session | null>;

  /**
   * Updates the state of a session and optionally appends a list of new events.
   * This method should ensure that the session's `updatedAt` timestamp is also refreshed.
   * @param sessionId The ID of the session whose state and events are to be updated.
   * @param state The new state to apply (or the current state if only appending events).
   * @param eventsToAppend An optional array of new events to append to the session's history.
   * @returns The updated Session object or null if the session is not found.
   */
  updateSessionState(sessionId: string, state: SessionState, eventsToAppend?: Event[]): Promise<Session | null>;

  /**
   * Lists sessions, potentially filtered by user or application.
   * @param appName Optional name of the application to filter by.
   * @param userId Optional ID of the user to filter by.
   * @returns A list of Session objects.
   */
  listSessions?(appName?: string, userId?: string): Promise<Session[]>;

  /**
   * Deletes a session.
   * @param sessionId The ID of the session to delete.
   * @returns True if deletion was successful, false otherwise.
   */
  deleteSession?(sessionId: string): Promise<boolean>;

  /**
   * Clears all sessions. Primarily for testing or admin purposes.
   * @returns A promise that resolves when all sessions are cleared.
   */
  clearAllSessions?(): Promise<void>;
} 