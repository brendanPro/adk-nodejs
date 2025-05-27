import { InMemorySessionService } from '../InMemorySessionService.js';
import { ISessionService } from '../ISessionService.js';
import { Session, SessionState } from '../../common/Session.js';
import { Event, EventType } from '../../common/Event.js';
// import { Event } from '../../common/Event.js'; // Event is not directly used in these tests yet, but Session imports it.

describe('InMemorySessionService', () => {
    let service: InMemorySessionService;
    let testUserId: string;
    let testAppName: string;
    // testSessionId is no longer used to create sessions, it will be generated.
    // We might still use it to store an ID obtained from a created session for later retrieval.

    beforeEach(() => {
        service = new InMemorySessionService();
        testUserId = 'test-user';
        testAppName = 'test-app';
    });

    describe('createSession', () => {
        it('should create a new session with correct initial values', async () => {
            const newSession = await service.createSession(testUserId, testAppName);

            expect(newSession).toBeDefined();
            expect(newSession.id).toEqual(expect.any(String)); // ID is auto-generated
            expect(newSession.userId).toBe(testUserId);
            expect(newSession.appName).toBe(testAppName);
            expect(newSession.state).toBeInstanceOf(SessionState);
            expect(newSession.state.getAll()).toEqual({});
            expect(newSession.events).toEqual([]);
            expect(newSession.createdAt).toBeInstanceOf(Date);
            expect(newSession.updatedAt).toBeInstanceOf(Date);
            expect(newSession.updatedAt!.getTime()).toBeGreaterThanOrEqual(newSession.createdAt!.getTime());
        });

        it('should create a session with provided initial state and events', async () => {
            const initialState = new SessionState({ customData: 'testData', count: 100 });
            const initialEvent: Event = { eventId: 'evt-init', interactionId: 'intr-0', sessionId: 'will-be-overwritten', type: EventType.CUSTOM, source: {type: 'SYSTEM', name: 'init'}, timestamp: new Date(), data: {}};
            const newSession = await service.createSession(testUserId, testAppName, initialState, [initialEvent]);

            expect(newSession.state.get('customData')).toBe('testData');
            expect(newSession.state.get('count')).toBe(100);
            expect(newSession.events).toHaveLength(1);
            expect(newSession.events[0].eventId).toBe('evt-init');
            // The session ID in the event should be updated by the service to match the new session's ID
            expect(newSession.events[0].sessionId).toBe(newSession.id);
        });
        
        // The concept of "existing session with same composite key" is removed as createSession always creates a new one with a UUID.
        // If a session with a specific ID needs to be retrieved, getSession should be used.
        // If a specific ID needs to be pre-determined, that's outside the scope of createSession.
    });

    describe('getSession', () => {
        it('should retrieve an existing session by its ID', async () => {
            const createdSession = await service.createSession(testUserId, testAppName);
            const retrievedSession = await service.getSession(createdSession.id);

            expect(retrievedSession).toBeDefined();
            expect(retrievedSession).not.toBeNull();
            expect(retrievedSession!.id).toBe(createdSession.id);
            expect(retrievedSession!.appName).toBe(testAppName);
            expect(retrievedSession!.userId).toBe(testUserId);
            // It should be a structurally equivalent object, but not necessarily the same instance
            // depending on implementation (though for in-memory, it often is).
            // Let's check properties instead of instance equality for robustness.
            expect(retrievedSession).toEqual(createdSession);
        });

        it('should return null if session ID does not exist', async () => {
            const retrievedSession = await service.getSession('non-existent-session-id');
            expect(retrievedSession).toBeNull();
        });
    });

    describe('appendEvent', () => {
        let createdSession: Session;
        let sampleEvent: Event;

        beforeEach(async () => {
            createdSession = await service.createSession(testUserId, testAppName);
            sampleEvent = {
                eventId: 'evt-1',
                interactionId: 'intr-1',
                sessionId: createdSession.id, // Event should target the correct session
                type: EventType.MESSAGE,
                source: { type: 'USER', name: 'test-user' },
                timestamp: new Date(),
                data: { message: 'Hello' },
            };
        });

        it('should append an event to an existing session and update timestamp', async () => {
            const initialUpdatedAt = createdSession.updatedAt!;
            await new Promise(resolve => setTimeout(resolve, 1)); 

            const updatedSession = await service.appendEvent(createdSession.id, sampleEvent);

            expect(updatedSession).toBeDefined();
            expect(updatedSession!.events).toHaveLength(1);
            expect(updatedSession!.events[0]).toEqual(sampleEvent);
            expect(updatedSession!.updatedAt!.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
            expect(updatedSession!.id).toBe(createdSession.id);
        });

        it('should append multiple events correctly', async () => {
            const event2: Event = { ...sampleEvent, eventId: 'evt-2', data: { message: 'Hello again' } };
            await service.appendEvent(createdSession.id, sampleEvent);
            await service.appendEvent(createdSession.id, event2);

            const retrievedSession = await service.getSession(createdSession.id);
            expect(retrievedSession!.events).toHaveLength(2);
            expect(retrievedSession!.events[0]).toEqual(sampleEvent);
            expect(retrievedSession!.events[1]).toEqual(event2);
        });

        it('should throw an error if trying to append event to a non-existent session ID', async () => {
            const nonExistentSessionId = 'non-existent-session-id-for-append';
            await expect(service.appendEvent(nonExistentSessionId, sampleEvent))
                .rejects
                .toThrow(`Session with ID ${nonExistentSessionId} not found`);
        });
    });

    describe('updateSessionState', () => {
        let createdSession: Session;

        beforeEach(async () => {
            createdSession = await service.createSession(testUserId, testAppName);
        });

        it('should update the state of an existing session and update timestamp', async () => {
            const initialUpdatedAt = createdSession.updatedAt!;
            const newState = new SessionState({ key1: 'value1', progress: 75 });
            const eventToAppend: Event = { 
                eventId: 'evt-state-update', 
                interactionId: 'intr-state', 
                sessionId: createdSession.id, 
                type: EventType.CUSTOM, 
                source:{type:'SYSTEM', name:'state-update'}, 
                timestamp: new Date(), 
                data: { stateChange: 'key1 set'} as any // Cast to any for custom event data
            };

            await new Promise(resolve => setTimeout(resolve, 1));

            const updatedSession = await service.updateSessionState(createdSession.id, newState, [eventToAppend]);

            expect(updatedSession).toBeDefined();
            // Check if the state object itself is replaced or mutated based on implementation.
            // Assuming it's replaced or properties are deeply copied.
            expect(updatedSession!.state.get('key1')).toBe('value1');
            expect(updatedSession!.state.get('progress')).toBe(75);
            expect(updatedSession!.updatedAt!.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
            expect(updatedSession!.id).toBe(createdSession.id);
            expect(updatedSession!.events).toHaveLength(1); // Assuming events from createSession are empty initially
            expect(updatedSession!.events.find(e => e.eventId === 'evt-state-update')).toBeDefined();
        });
        
        it('should update state without appending events if none are provided', async () => {
            const newState = new SessionState({ keyOnly: 'valueOnly' });
            const updatedSession = await service.updateSessionState(createdSession.id, newState);
            expect(updatedSession).toBeDefined();
            expect(updatedSession!.state.get('keyOnly')).toBe('valueOnly');
            expect(updatedSession!.events).toEqual([]); // No events should be appended
        });

        it('should throw an error if trying to update state for a non-existent session ID', async () => {
            const nonExistentSessionId = 'non-existent-session-id-for-update';
            const newState = new SessionState({ attempt: 'failed' });

            await expect(service.updateSessionState(nonExistentSessionId, newState))
                .rejects
                .toThrow(`Session with ID ${nonExistentSessionId} not found`);
        });
    });

    describe('listSessions', () => {
        it('should return an empty array if no sessions exist', async () => {
            expect(await service.listSessions()).toEqual([]);
            expect(await service.listSessions(testAppName)).toEqual([]);
            expect(await service.listSessions(undefined, testUserId)).toEqual([]);
            expect(await service.listSessions(testAppName, testUserId)).toEqual([]);
        });

        it('should return all sessions if no filters are provided', async () => {
            const session1 = await service.createSession(testUserId, testAppName);
            const session2 = await service.createSession(testUserId, 'other-app');
            const session3 = await service.createSession('other-user', testAppName);
            
            const sessions = await service.listSessions();
            expect(sessions).toHaveLength(3);
            expect(sessions).toEqual(expect.arrayContaining([session1, session2, session3]));
        });

        it('should filter sessions by appName', async () => {
            const session1AppA = await service.createSession(testUserId, testAppName);
            await service.createSession(testUserId, 'other-app'); // Different app
            const session3AppA = await service.createSession('other-user', testAppName);
            
            const sessions = await service.listSessions(testAppName);
            expect(sessions).toHaveLength(2);
            expect(sessions).toEqual(expect.arrayContaining([session1AppA, session3AppA]));
        });

        it('should filter sessions by userId', async () => {
            const session1UserA = await service.createSession(testUserId, testAppName);
            await service.createSession('other-user', testAppName); // Different user
            const session3UserA = await service.createSession(testUserId, 'other-app');

            const sessions = await service.listSessions(undefined, testUserId);
            expect(sessions).toHaveLength(2);
            expect(sessions).toEqual(expect.arrayContaining([session1UserA, session3UserA]));
        });

        it('should filter sessions by appName and userId', async () => {
            const session1AppAUserA = await service.createSession(testUserId, testAppName);
            await service.createSession(testUserId, 'other-app'); // Same user, different app
            await service.createSession('other-user', testAppName);     // Same app, different user
            await service.createSession('other-user', 'other-app'); // Different app, different user
            
            const sessions = await service.listSessions(testAppName, testUserId);
            expect(sessions).toHaveLength(1);
            expect(sessions[0]).toEqual(session1AppAUserA);
        });
    });

    describe('deleteSession', () => {
        it('should delete an existing session and return true', async () => {
            const session = await service.createSession(testUserId, testAppName);
            const result = await service.deleteSession(session.id);
            expect(result).toBe(true);

            const retrievedSession = await service.getSession(session.id);
            expect(retrievedSession).toBeNull();
        });

        it('should return false if session to delete does not exist', async () => {
            const result = await service.deleteSession('non-existent-id-for-delete');
            expect(result).toBe(false);
        });
    });

    describe('clearAllSessions', () => {
        it('should clear all sessions from the service', async () => {
            await service.createSession(testUserId, testAppName);
            await service.createSession('user2', 'app2');
            
            let sessions = await service.listSessions();
            expect(sessions.length).toBeGreaterThan(0);

            await service.clearAllSessions();
            sessions = await service.listSessions();
            expect(sessions).toEqual([]);
        });

        it('should resolve even if no sessions exist to clear', async () => {
            await expect(service.clearAllSessions()).resolves.toBeUndefined();
            const sessions = await service.listSessions();
            expect(sessions).toEqual([]);
        });
    });
}); 