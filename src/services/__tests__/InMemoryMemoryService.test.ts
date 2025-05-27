import { InMemoryMemoryService } from '../InMemoryMemoryService.js';
import { IMemoryService, MemorySearchResult, MemorySegment } from '../IMemoryService.js';
import { Event, EventType, EventSource, EventData } from '../../common/Event.js';
import { Content, Part } from '../../models/LlmContent.js';

describe('InMemoryMemoryService', () => {
    let service: InMemoryMemoryService; // Use concrete type for clearAllData helper
    let testAppName: string;
    let testUserId: string; // Not directly used by addEventsToHistory, but good for context
    let testSessionId1: string;
    let testSessionId2: string;
    let sampleEvent1: Event;
    let sampleEvent2: Event;

    beforeEach(() => {
        service = new InMemoryMemoryService();
        testAppName = 'memory-app';
        testUserId = 'memory-user';
        testSessionId1 = 'sess-mem-abc';
        testSessionId2 = 'sess-mem-xyz';

        sampleEvent1 = {
            eventId: 'evt-mem-1',
            interactionId: 'intr-mem-1',
            sessionId: testSessionId1,
            type: EventType.MESSAGE,
            source: { type: 'USER', name: testUserId },
            timestamp: new Date(Date.now() - 1000),
            data: { message: 'Hello from history' },
        };

        sampleEvent2 = {
            eventId: 'evt-mem-2',
            interactionId: 'intr-mem-1',
            sessionId: testSessionId1,
            type: EventType.MESSAGE,
            source: { type: 'AGENT', name: 'TestAgent' },
            timestamp: new Date(),
            data: { message: 'Agent response' },
        };
    });

    describe('addEventsToHistory', () => {
        it('should add a single event to history for a given appName and sessionId', async () => {
            await service.addEventsToHistory(testAppName, testSessionId1, [sampleEvent1]);
            const history = await service.getHistory(testAppName, testSessionId1);
            expect(history).toEqual([sampleEvent1]);
        });

        it('should add multiple events to history in the correct order', async () => {
            await service.addEventsToHistory(testAppName, testSessionId1, [sampleEvent1, sampleEvent2]);
            const history = await service.getHistory(testAppName, testSessionId1);
            expect(history).toEqual([sampleEvent1, sampleEvent2]);
        });

        it('should append events if called multiple times for the same session', async () => {
            await service.addEventsToHistory(testAppName, testSessionId1, [sampleEvent1]);
            await service.addEventsToHistory(testAppName, testSessionId1, [sampleEvent2]);
            const history = await service.getHistory(testAppName, testSessionId1);
            expect(history).toEqual([sampleEvent1, sampleEvent2]);
        });

        it('should store event history separately for different sessionIds', async () => {
            const eventForSession2: Event = { ...sampleEvent1, sessionId: testSessionId2, eventId: 'evt-mem-s2' };
            await service.addEventsToHistory(testAppName, testSessionId1, [sampleEvent1]);
            await service.addEventsToHistory(testAppName, testSessionId2, [eventForSession2]);
            
            const history1 = await service.getHistory(testAppName, testSessionId1);
            expect(history1).toEqual([sampleEvent1]);

            const history2 = await service.getHistory(testAppName, testSessionId2);
            expect(history2).toEqual([eventForSession2]);
        });

        it('should store event history separately for different appNames', async () => {
            const otherAppName = 'other-memory-app';
            const eventForOtherApp: Event = { ...sampleEvent2, eventId: 'evt-mem-other-app' }; // Ensure distinct event object

            await service.addEventsToHistory(testAppName, testSessionId1, [sampleEvent1]);
            await service.addEventsToHistory(otherAppName, testSessionId1, [eventForOtherApp]); 

            const historyApp1 = await service.getHistory(testAppName, testSessionId1);
            expect(historyApp1).toEqual([sampleEvent1]);

            const historyOtherApp = await service.getHistory(otherAppName, testSessionId1);
            expect(historyOtherApp).toEqual([eventForOtherApp]);
        });

        it('should return an empty array from getHistory for a session with no events', async () => {
            const history = await service.getHistory(testAppName, 'new-session-no-events');
            expect(history).toEqual([]);
        });

        it('should not throw if an empty array of events is provided to addEventsToHistory', async () => {
            await expect(service.addEventsToHistory(testAppName, testSessionId1, [])).resolves.not.toThrow();
            const history = await service.getHistory(testAppName, testSessionId1);
            expect(history).toEqual([]); // History should remain empty or unchanged
        });
    });

    describe('addMemory', () => {
        let sampleContentObj: Content;
        let sampleTextContent: string;

        beforeEach(() => {
            sampleTextContent = 'This is a simple text memory.';
            sampleContentObj = {
                parts: [{ text: 'This is structured content memory.' }],
                role: 'user' // Role might not be directly used by addMemory but good for Content obj
            };
        });

        it('should add string content to memory and return a segment ID', async () => {
            const segmentId = await service.addMemory(testAppName, testUserId, testSessionId1, sampleTextContent);
            expect(segmentId).toEqual(expect.any(String));
            // Verification will primarily happen via searchMemory tests
        });

        it('should add Content object to memory and return a segment ID', async () => {
            const segmentId = await service.addMemory(testAppName, testUserId, testSessionId1, sampleContentObj);
            expect(segmentId).toEqual(expect.any(String));
            // The service stringifies content.parts
        });

        it('should return void if no content is provided', async () => {
            const segmentId = await service.addMemory(testAppName, testUserId, testSessionId1, undefined);
            expect(segmentId).toBeUndefined();
        });

        it('should store memory associated with appName, userId, and optional sessionId', async () => {
            const id1 = await service.addMemory(testAppName, testUserId, testSessionId1, 'session specific memory');
            const id2 = await service.addMemory(testAppName, testUserId, undefined, 'user global memory'); // No sessionID
            expect(id1).toEqual(expect.any(String));
            expect(id2).toEqual(expect.any(String));
            // Later verify with searchMemory that these can be filtered correctly
        });

        it('should store metadata along with the memory segment', async () => {
            const metadata = { source: 'test-data', importance: 5 };
            const segmentId = await service.addMemory(testAppName, testUserId, testSessionId1, 'memory with metadata', metadata);
            expect(segmentId).toEqual(expect.any(String));
            // Verification of metadata retrieval will be part of searchMemory tests
        });
    });

    describe('searchMemory', () => {
        let memId1: string, memId2: string, memId3: string, memId4: string, memId5_global: string;
        const meta1 = { tag: 'tech' };
        const meta3 = { tag: 'food' };

        beforeEach(async () => {
            // Clear previous memories before each test in this block
            service.clearAll(); // Assumes clearAll clears memorySegments and sessionHistories

            memId1 = (await service.addMemory(testAppName, testUserId, testSessionId1, 'Alpha Bravo Charlie tech', meta1)) as string;
            memId2 = (await service.addMemory(testAppName, testUserId, testSessionId1, 'Delta Echo Foxtrot food')) as string;
            memId3 = (await service.addMemory(testAppName, testUserId, testSessionId2, 'Charlie Golf Hotel food', meta3)) as string;
            memId4 = (await service.addMemory('other-app', testUserId, testSessionId1, 'Alpha Indigo Juliett tech')) as string;
            memId5_global = (await service.addMemory(testAppName, testUserId, undefined, 'Global Kilo Lima tech')) as string; 
        });

        it('should return an empty array if no query is provided', async () => {
            const results = await service.searchMemory(testAppName, testUserId, testSessionId1, undefined);
            expect(results).toEqual([]);
        });

        it('should return an empty array if no memory matches the query', async () => {
            const results = await service.searchMemory(testAppName, testUserId, testSessionId1, 'NonExistentTerm');
            expect(results).toEqual([]);
        });

        it('should find memory with string query, case-insensitive, and retrieve metadata', async () => {
            const results = await service.searchMemory(testAppName, testUserId, testSessionId1, 'alpha bravo');
            expect(results).toHaveLength(1);
            expect(results[0].document.parts[0].text).toBe('Alpha Bravo Charlie tech');
            expect(results[0].metadata).toEqual(meta1);
        });

        it('should find memory using Content query (stringified match)', async () => {
            const queryContent: Content = { parts: [{ text: 'Delta Echo' }] };
            const results = await service.searchMemory(testAppName, testUserId, testSessionId1, queryContent);
            expect(results).toHaveLength(1);
            expect(results[0].document.parts[0].text).toBe('Delta Echo Foxtrot food');
        });

        it('should filter by appName', async () => {
            const results = await service.searchMemory('other-app', testUserId, testSessionId1, 'Alpha');
            expect(results).toHaveLength(1);
            expect(results[0].document.parts[0].text).toBe('Alpha Indigo Juliett tech');
        });

        it('should filter by userId (implicitly, as all beforeEach data is for testUserId)', async () => {
            // All added data is for testUserId. A search for another user would yield 0.
            const results = await service.searchMemory(testAppName, 'another-user', testSessionId1, 'Alpha');
            expect(results).toHaveLength(0);
        });

        it('should filter by sessionId when provided in arguments', async () => {
            const results = await service.searchMemory(testAppName, testUserId, testSessionId2, 'charlie');
            expect(results).toHaveLength(1);
            expect(results[0].document.parts[0].text).toBe('Charlie Golf Hotel food');
            expect(results[0].metadata).toEqual(meta3);
        });

        it('should filter by sessionId when provided in filters object', async () => {
            const results = await service.searchMemory(testAppName, testUserId, undefined, 'charlie', 5, { sessionId: testSessionId2 });
            expect(results).toHaveLength(1);
            expect(results[0].document.parts[0].text).toBe('Charlie Golf Hotel food');
        });

        it('should respect topK parameter', async () => {
            // Add more data that matches to test topK
            await service.addMemory(testAppName, testUserId, testSessionId1, 'Charlie Kilo Mike food');
            await service.addMemory(testAppName, testUserId, testSessionId1, 'Charlie November Oscar food');
            const results = await service.searchMemory(testAppName, testUserId, testSessionId1, 'food', 2);
            expect(results).toHaveLength(2);
        });

        it('should find global memories (no sessionId) when sessionId filter is not applied', async () => {
            const results = await service.searchMemory(testAppName, testUserId, undefined, 'Global Kilo');
            expect(results).toHaveLength(1);
            expect(results[0].document.parts[0].text).toBe('Global Kilo Lima tech');
        });

        it('should NOT find global memories if a specific sessionId is passed in args', async () => {
            const results = await service.searchMemory(testAppName, testUserId, testSessionId1, 'Global Kilo');
            expect(results).toHaveLength(0);
        });

         it('should NOT find global memories if a specific sessionId is passed in filters', async () => {
            const results = await service.searchMemory(testAppName, testUserId, undefined, 'Global Kilo', 5, { sessionId: testSessionId1 });
            expect(results).toHaveLength(0);
        });

        it('should retrieve metadata correctly with the search result', async () => {
            const results = await service.searchMemory(testAppName, testUserId, testSessionId1, 'Alpha Bravo');
            expect(results[0].metadata).toEqual(meta1); // meta1 was added with 'Alpha Bravo Charlie tech'
        });
    });

    describe('deleteMemory', () => {
        it('should successfully delete a memory segment and return true', async () => {
            const segmentId = (await service.addMemory(testAppName, testUserId, testSessionId1, 'To be deleted')) as string;
            expect(segmentId).toBeDefined();
            
            const deleteResult = await service.deleteMemory(testAppName, testUserId, segmentId);
            expect(deleteResult).toBe(true);

            const searchResults = await service.searchMemory(testAppName, testUserId, testSessionId1, 'To be deleted');
            expect(searchResults).toHaveLength(0);
        });

        it('should return false if trying to delete a non-existent memory ID', async () => {
            const deleteResult = await service.deleteMemory(testAppName, testUserId, 'non-existent-id');
            expect(deleteResult).toBe(false);
        });

        it('deleting one segment should not affect other segments', async () => {
            const keepId = (await service.addMemory(testAppName, testUserId, testSessionId1, 'Keep this memory')) as string;
            const deleteId = (await service.addMemory(testAppName, testUserId, testSessionId1, 'Delete this one too')) as string;

            await service.deleteMemory(testAppName, testUserId, deleteId);

            const keptResults = await service.searchMemory(testAppName, testUserId, testSessionId1, 'Keep this memory');
            expect(keptResults).toHaveLength(1);
            expect(keptResults[0].document.parts[0].text).toBe('Keep this memory');

            const deletedResults = await service.searchMemory(testAppName, testUserId, testSessionId1, 'Delete this one too');
            expect(deletedResults).toHaveLength(0);
        });
    });

    describe('retrieveMemory', () => {
        // Based on current InMemoryMemoryService, retrieveMemory is a wrapper around searchMemory
        it('should retrieve segments similar to searchMemory based on query', async () => {
            await service.addMemory(testAppName, testUserId, testSessionId1, 'Specific content for retrieve', { originalId: 'retrieve-1'});
            const results = await service.retrieveMemory(testAppName, testUserId, testSessionId1, 'Specific content for retrieve', 1);
            expect(results).toHaveLength(1);
            expect(results[0].content).toBe('Specific content for retrieve');
            expect(results[0].metadata?.originalId).toBe('retrieve-1');
        });

        it('should respect limit parameter in retrieveMemory', async () => {
            await service.addMemory(testAppName, testUserId, testSessionId1, 'Retrieve item 1');
            await service.addMemory(testAppName, testUserId, testSessionId1, 'Retrieve item 2');
            const results = await service.retrieveMemory(testAppName, testUserId, testSessionId1, 'Retrieve item', 1);
            expect(results).toHaveLength(1);
        });
    });

    describe('clearAll', () => {
        it('should clear all memory segments and session histories', async () => {
            // Add history
            await service.addEventsToHistory(testAppName, testSessionId1, [sampleEvent1]);
            // Add memory segment
            await service.addMemory(testAppName, testUserId, testSessionId1, 'Some memorable content');

            service.clearAll();

            const history = await service.getHistory(testAppName, testSessionId1);
            expect(history).toEqual([]);

            const memoryResults = await service.searchMemory(testAppName, testUserId, testSessionId1, 'Some memorable content');
            expect(memoryResults).toEqual([]);
        });
    });
}); 