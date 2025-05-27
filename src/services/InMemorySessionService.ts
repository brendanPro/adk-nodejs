import { Session, SessionState } from '../common/Session.js';
import { Event } from '../common/Event.js';
import { ISessionService } from './ISessionService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * An in-memory implementation of the ISessionService.
 * Useful for development and testing.
 * Note: Data will be lost when the process exits.
 */
export class InMemorySessionService implements ISessionService {
  // Use sessionId as the primary key, as per ISessionService interface
  private sessions: Map<string, Session> = new Map();

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) || null;
  }

  async createSession(
    userId: string,
    appName: string,
    initialState?: SessionState,
    initialEvents?: Event[]
  ): Promise<Session> {
    const sessionId = uuidv4();
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision for ${sessionId}`);
    }

    const processedEvents = initialEvents ? initialEvents.map(event => ({ ...event, sessionId: sessionId })) : [];

    const newSession: Session = {
      id: sessionId,
      userId,
      appName,
      events: processedEvents,
      state: initialState || new SessionState(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, newSession);
    return newSession;
  }

  async appendEvent(sessionId: string, event: Event): Promise<Session | null> {
    const existingSession = this.sessions.get(sessionId);
    if (!existingSession) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }
    let eventToPush = event;
    if (eventToPush.sessionId !== sessionId) {
        console.warn(`Appending event with ID ${eventToPush.eventId} which has sessionId ${eventToPush.sessionId} to session ${sessionId}. Overwriting event's sessionId.`);
        eventToPush = { ...eventToPush, sessionId: sessionId };
    }
    existingSession.events.push(eventToPush);
    existingSession.updatedAt = new Date();
    return existingSession;
  }

  async updateSessionState(sessionId: string, state: SessionState, eventsToAppend?: Event[]): Promise<Session | null> {
    const existingSession = this.sessions.get(sessionId);
    if (!existingSession) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }
    existingSession.state = state;
    if (eventsToAppend) {
      const processedEventsToAppend = eventsToAppend.map(event => {
        if (event.sessionId !== sessionId) {
            console.warn(`Appending event with ID ${event.eventId} during state update which has sessionId ${event.sessionId} to session ${sessionId}. Overwriting event's sessionId.`);
            return { ...event, sessionId: sessionId };
        }
        return event;
      });
      existingSession.events.push(...processedEventsToAppend);
    }
    existingSession.updatedAt = new Date();
    return existingSession;
  }

  async listSessions(appName?: string, userId?: string): Promise<Session[]> {
    let filteredSessions = Array.from(this.sessions.values());
    if (appName) {
      filteredSessions = filteredSessions.filter(s => s.appName === appName);
    }
    if (userId) {
      filteredSessions = filteredSessions.filter(s => s.userId === userId);
    }
    return filteredSessions;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async clearAllSessions(): Promise<void> {
    this.sessions.clear();
    return Promise.resolve();
  }
} 