import { Event } from '../common/Event.js';
import { Content } from '../models/LlmContent.js';

/**
 * Represents a search result from memory.
 */
export interface MemorySearchResult {
  document: Content; // Or a more specific type for structured memory documents
  score: number;
  metadata?: Record<string, any>;
}

/** Placeholder for MemorySegment. Define its structure as needed. */
export interface MemorySegment {
  id: string;
  content: string; // Or a more complex structure like Content from Event.js
  score?: number; // Relevance score, if applicable
  metadata?: Record<string, any>;
}

/**
 * Interface for managing long-term memory or knowledge base for agents.
 */
export interface IMemoryService {
  /**
   * Adds a document or piece of content to the memory.
   * @param appName The name of the application.
   * @param userId The ID of the user.
   * @param sessionId The ID of the session (optional, if memory is session-specific).
   * @param content The content to add to memory.
   * @param metadata Optional metadata associated with the content.
   * @returns A unique ID for the stored memory item, or void.
   */
  addMemory(
    appName: string,
    userId: string,
    sessionId?: string,
    content?: Content,
    metadata?: Record<string, any>
  ): Promise<string | void>;

  /**
   * Searches the memory for relevant information.
   * @param appName The name of the application.
   * @param userId The ID of the user.
   * @param sessionId The ID of the session (optional).
   * @param query The search query (can be text or a Content object for multimodal search).
   * @param topK The number of top results to return.
   * @param filters Optional filters to apply to the search.
   * @returns A list of memory search results.
   */
  searchMemory(
    appName: string,
    userId: string,
    sessionId?: string,
    query?: Content | string,
    topK?: number,
    filters?: Record<string, any>
  ): Promise<MemorySearchResult[]>;

  /**
   * Deletes a memory item by its ID.
   * @param appName The name of the application.
   * @param userId The ID of the user.
   * @param memoryId The ID of the memory item to delete.
   * @returns True if deletion was successful, false otherwise.
   */
  deleteMemory?(appName: string, userId: string, memoryId: string): Promise<boolean>;

  retrieveMemory(
    appName: string,
    userId: string,
    sessionId: string,
    query: string,
    limit?: number
  ): Promise<MemorySegment[]>;

  /**
   * Adds a list of events to the history of a given session.
   * @param appName The name of the application.
   * @param sessionId The ID of the session.
   * @param events The array of events to add.
   * @returns A promise that resolves when the events have been added.
   */
  addEventsToHistory(
    appName: string,
    sessionId: string,
    events: Event[]
  ): Promise<void>;
} 