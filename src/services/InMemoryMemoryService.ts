import { Event } from '../common/Event.js';
import { Content } from '../models/LlmContent.js';
import { IMemoryService, MemorySegment, MemorySearchResult } from './IMemoryService.js';
import { v4 as uuidv4 } from 'uuid';

interface StoredMemorySegment extends MemorySegment {
  appName: string;
  userId: string;
  sessionId?: string; // Memory can be global or session-specific
  createdAt: Date;
}

/**
 * An in-memory implementation of the IMemoryService.
 * Useful for development and testing.
 * Note: Data will be lost when the process exits.
 */
export class InMemoryMemoryService implements IMemoryService {
  private memorySegments: Map<string, StoredMemorySegment> = new Map(); // segmentId -> StoredMemorySegment
  private sessionHistories: Map<string, Event[]> = new Map(); // compositeSessionKey -> Event[]

  private getCompositeSessionKey(appName: string, sessionId: string): string {
    return `${appName}-hist-${sessionId}`;
  }

  async addMemory(
    appName: string,
    userId: string,
    sessionId?: string,
    content?: Content | string, // Allow Content or simple string for memory
    metadata?: Record<string, any>
  ): Promise<string | void> {
    if (!content) return;

    const segmentId = uuidv4();
    const contentAsString = typeof content === 'string' ? content : JSON.stringify(content.parts); // Simple string conversion
    
    const newSegment: StoredMemorySegment = {
      id: segmentId,
      content: contentAsString, // Store the stringified content
      score: undefined, // Score is usually for search results
      metadata: metadata || {},
      appName,
      userId,
      sessionId,
      createdAt: new Date(),
    };
    this.memorySegments.set(segmentId, newSegment);
    return segmentId;
  }

  async searchMemory(
    appName: string,
    userId: string,
    sessionId?: string,
    query?: Content | string,
    topK = 5,
    filters?: Record<string, any> // Basic filtering by appName, userId, sessionId for now
  ): Promise<MemorySearchResult[]> {
    if (!query) return [];

    let queryString: string;
    if (typeof query === 'string') {
        queryString = query.toLowerCase();
    } else {
        // query is a Content object
        queryString = query.parts.map(part => part.text || '').join(' ').toLowerCase();
    }

    let candidates = Array.from(this.memorySegments.values());

    // Apply filters
    candidates = candidates.filter(seg => seg.appName === appName);
    candidates = candidates.filter(seg => seg.userId === userId);
    if (sessionId && (!filters || filters.sessionId === undefined || filters.sessionId === sessionId)) {
      // If sessionId is provided either in args or filters, filter by it.
      // This logic might need refinement based on how global vs session-specific memory is handled.
      candidates = candidates.filter(seg => seg.sessionId === sessionId);
    } else if (filters?.sessionId) {
       candidates = candidates.filter(seg => seg.sessionId === filters.sessionId);
    }
    // Add more sophisticated filtering based on `filters` object if needed

    const scoredCandidates = candidates
      .map(seg => {
        // Very basic scoring: presence of query string in content
        const score = seg.content.toLowerCase().includes(queryString) ? 1 : 0;
        return { ...seg, score };
      })
      .filter(seg => seg.score > 0) // Only include segments that match
      .sort((a, b) => b.score - a.score); // Sort by score descending

    return scoredCandidates.slice(0, topK).map(seg => ({
      document: { parts: [{ text: seg.content }] }, // Reconstruct as Content for MemorySearchResult
      score: seg.score,
      metadata: seg.metadata,
    }));
  }

  async deleteMemory(appName: string, userId: string, memoryId: string): Promise<boolean> {
    // In a real system, you might want to check appName/userId for ownership before deleting
    return this.memorySegments.delete(memoryId);
  }

  async retrieveMemory(
    appName: string,
    userId: string,
    sessionId: string, // Assuming retrieveMemory is session-specific for now
    query: string, // This query might be a direct ID or a search term
    limit = 1 // Default to 1 as if fetching a specific segment by an ID-like query
  ): Promise<MemorySegment[]> {
     // This is a simplified retrieveMemory; a real one might fetch by specific IDs passed in query
     // or perform a targeted lookup. For now, reuse searchMemory logic.
    const searchResults = await this.searchMemory(appName, userId, sessionId, query, limit);
    return searchResults.map(sr => ({
        id: sr.metadata?.originalId || uuidv4(), // Try to get original ID or generate new one
        content: sr.document.parts.map(p => p.text || '').join('\n'), // Convert Content back to string
        score: sr.score,
        metadata: sr.metadata,
    }));
  }

  async addEventsToHistory(
    appName: string,
    sessionId: string,
    events: Event[]
  ): Promise<void> {
    const key = this.getCompositeSessionKey(appName, sessionId);
    const history = this.sessionHistories.get(key) || [];
    history.push(...events);
    this.sessionHistories.set(key, history);
  }
  
  // Optional: Method to get history, primarily for InMemorySessionService to load it if needed.
  async getHistory(appName: string, sessionId: string): Promise<Event[]> {
    const key = this.getCompositeSessionKey(appName, sessionId);
    return this.sessionHistories.get(key) || [];
  }

  // Helper to clear all memories and histories, useful for testing
  clearAll(): void {
    this.memorySegments.clear();
    this.sessionHistories.clear();
  }
} 