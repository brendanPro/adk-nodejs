import { Event } from './Event.js';

/**
 * Represents the mutable state associated with a session.
 * This is a simple key-value store.
 */
export class SessionState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: Record<string, any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(initialStore?: Record<string, any>) {
    this.store = initialStore ? { ...initialStore } : {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get<T = any>(key: string): T | undefined {
    return this.store[key] as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set<T = any>(key: string, value: T): void {
    this.store[key] = value;
  }

  has(key: string): boolean {
    return key in this.store;
  }

  delete(key: string): boolean {
    if (this.has(key)) {
      delete this.store[key];
      return true;
    }
    return false;
  }

  /** Returns a shallow copy of the entire state store. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll(): Record<string, any> {
    return { ...this.store };
  }

  // In Python, there was `has_delta()` used with `CallbackContext`.
  // For now, direct mutation is assumed, and change tracking can be added if complex state management is needed.
}

/**
 * Represents a user's session with an agent application.
 */
export interface Session {
  /** Unique ID for the session. */
  id: string;

  /** ID of the user this session belongs to. */
  userId: string;

  /** Name of the application this session is for. */
  appName: string;

  /** The chronological list of events that have occurred in this session. */
  events: Event[];

  /** The mutable state associated with this session. */
  state: SessionState;

  /** Timestamp of when the session was created. */
  createdAt?: Date;

  /** Timestamp of the last update to the session. */
  updatedAt?: Date;

  /** Any additional custom metadata for this session. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customMetadata?: Record<string, any>;
} 