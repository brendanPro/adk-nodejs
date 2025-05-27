import { ContentRequestProcessor } from '../ContentRequestProcessor.js';
import { InvocationContext } from '../../../common/InvocationContext.js';
import { LlmRequest } from '../../../models/LlmRequest.js';
import { Event, EventType, EventSource, EventSourceType } from '../../../common/Event.js';
import { Session, SessionState } from '../../../common/Session.js';
import { Content, Part, FunctionCall, FunctionResponse } from '../../../models/LlmContent.js';
import { RunConfig } from '../../../common/RunConfig.js';
import { IAgent } from '../../../agents/IAgent.js';

// Mock IAgent for InvocationContext
const mockAgent: jest.Mocked<IAgent> = {
    name: 'mock-agent',
    description: 'A mock agent',
    runAsync: jest.fn(),
    llmConfig: undefined,
    toolset: undefined,
    parentAgent: undefined,
    subAgents: [],
    findAgent: jest.fn(),
    getRootAgent: jest.fn(() => mockAgent),
};

describe('ContentRequestProcessor', () => {
    let processor: ContentRequestProcessor;
    let mockContext: InvocationContext;
    let llmRequest: LlmRequest;

    beforeEach(() => {
        processor = new ContentRequestProcessor();
        
        const mockSession: Session = {
            id: 'session-test',
            userId: 'user-test',
            appName: 'app-test',
            events: [],
            state: new SessionState(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockRunConfig: RunConfig = {
            agentName: 'test-agent',
            input: { parts: [{text: 'current input'}] }, // Current input for the turn
        };

        mockContext = {
            invocationId: 'inv-test',
            session: mockSession,
            runConfig: mockRunConfig,
            agent: mockAgent, 
        };

        llmRequest = {
            model: 'test-model',
            contents: [{ role: 'user', parts: [{ text: 'Current turn prompt' }] }],
        };
    });

    test('should do nothing if session events are empty', async () => {
        mockContext.session.events = [];
        const originalContents = [...llmRequest.contents!];
        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual(originalContents);
    });

    test('should prepend a single user MESSAGE event to request contents', async () => {
        const userMessageContent: Content = { role: 'user', parts: [{ text: 'Hello from user' }] };
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'test-user' }, data: { content: userMessageContent }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        const currentTurnPrompt = { role: 'user', parts: [{ text: 'Current turn prompt' }] } as Content;
        llmRequest.contents = [currentTurnPrompt];
        
        await processor.processRequest(llmRequest, mockContext);
        
        expect(llmRequest.contents).toEqual([userMessageContent, currentTurnPrompt]);
    });

    test('should prepend user MESSAGE and model LLM_RESPONSE events in order', async () => {
        const userContent: Content = { role: 'user', parts: [{ text: 'Question?' }] };
        const modelContent: Content = { role: 'model', parts: [{ text: 'Answer!' }] };
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'u1' }, data: { content: userContent }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
            { eventId: 'e2', type: EventType.LLM_RESPONSE, source: { type: 'LLM', name: 'm1' }, data: { content: modelContent }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        const currentTurnPrompt = { role: 'user', parts: [{ text: 'Follow up' }] } as Content;
        llmRequest.contents = [currentTurnPrompt];

        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual([userContent, modelContent, currentTurnPrompt]);
    });

    test('should prepend MESSAGE, LLM_RESPONSE (function call), and TOOL_RESPONSE events', async () => {
        const userContent: Content = { role: 'user', parts: [{ text: 'Use the tool.' }] };
        const functionCall: FunctionCall = { name: 'get_weather', args: { location: 'London' } };
        const modelContentWithFunctionCall: Content = { role: 'model', parts: [{ functionCall }] };
        const toolResponseContent: Content = { role: 'tool', parts: [{ functionResponse: { name: 'get_weather', response: { weather: 'sunny' } } as FunctionResponse }] }; 
        
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'u1' }, data: { content: userContent }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
            { eventId: 'e2', type: EventType.LLM_RESPONSE, source: { type: 'LLM', name: 'm1' }, data: { content: modelContentWithFunctionCall }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
            { eventId: 'e3', type: EventType.TOOL_RESPONSE, source: { type: 'TOOL', name: 'get_weather' }, data: { content: toolResponseContent }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        const currentTurnPrompt = { role: 'user', parts: [{ text: 'What is the weather now?' }] } as Content;
        llmRequest.contents = [currentTurnPrompt];

        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual([userContent, modelContentWithFunctionCall, toolResponseContent, currentTurnPrompt]);
    });

    test('should correctly prepend history if request.contents already has items', async () => {
        const historyEventContent: Content = { role: 'user', parts: [{ text: 'Old message' }] };
        mockContext.session.events = [
            { eventId: 'e0', type: EventType.MESSAGE, source: { type: 'USER', name: 'u0' }, data: { content: historyEventContent }, timestamp: new Date(), interactionId: 'i0', sessionId: 's0' },
        ];
        const initialRequestItem: Content = { role: 'system', parts: [{ text: 'System instruction' }] };
        const currentTurnPrompt = { role: 'user', parts: [{ text: 'Current prompt for this turn' }] } as Content;
        llmRequest.contents = [initialRequestItem, currentTurnPrompt];

        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual([historyEventContent, initialRequestItem, currentTurnPrompt]);
    });

    test('should skip events if event.data or event.data.content is missing', async () => {
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'u1' }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' }, // No data
            { eventId: 'e2', type: EventType.LLM_RESPONSE, source: { type: 'LLM', name: 'm1' }, data: {}, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' }, // No content
        ];
        const originalContents = [...llmRequest.contents!];
        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual(originalContents);
    });

    test('should correctly assign roles: user for USER MESSAGE, model for AGENT MESSAGE, model for LLM_RESPONSE, tool for TOOL_RESPONSE', async () => {
        const userMessage: Content = { parts: [{ text: 'User text' }] }; // Role will be assigned
        const agentMessage: Content = { parts: [{ text: 'Agent text' }] }; // Role will be assigned
        const llmResponse: Content = { role: 'model', parts: [{ text: 'LLM direct response' }] }; // Role already present
        const toolResponse: Content = { role: 'tool', parts: [{ functionResponse: { name: 't', response: {}} as FunctionResponse }] }; // Role already present
        
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'u1' }, data: { content: userMessage }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
            { eventId: 'e2', type: EventType.MESSAGE, source: { type: 'AGENT', name: 'a1' }, data: { content: agentMessage }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
            { eventId: 'e3', type: EventType.LLM_RESPONSE, source: { type: 'LLM', name: 'm1' }, data: { content: llmResponse }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
            { eventId: 'e4', type: EventType.TOOL_RESPONSE, source: { type: 'TOOL', name: 't1' }, data: { content: toolResponse }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        llmRequest.contents = []; // Start with empty request contents for clarity

        await processor.processRequest(llmRequest, mockContext);
        
        expect(llmRequest.contents).toEqual([
            { role: 'user', parts: [{ text: 'User text' }] },
            { role: 'model', parts: [{ text: 'Agent text' }] },
            llmResponse, // Should use the original object with its role
            toolResponse,  // Should use the original object with its role
        ]);
    });

    test('should handle simple string messages from USER if data.content is not present', async () => {
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'u1' }, data: { message: 'Plain user string' }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        llmRequest.contents = [];
        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual([{ role: 'user', parts: [{ text: 'Plain user string' }] }]);
    });

    test('should ignore simple string messages from non-USER source if data.content is not present', async () => {
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'AGENT', name: 'a1' }, data: { message: 'Plain agent string' }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        llmRequest.contents = [];
        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual([]);
    });
    
    test('should ignore content if parts are empty or undefined', async () => {
        const userMessageNoParts: Content = { role: 'user', parts: [] };
        const agentMessageEmptyParts: Content = { role: 'model', parts: [] };
         mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'u1' }, data: { content: userMessageNoParts }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
            { eventId: 'e2', type: EventType.MESSAGE, source: { type: 'AGENT', name: 'a1' }, data: { content: agentMessageEmptyParts }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        const originalContents = [...llmRequest.contents!];
        await processor.processRequest(llmRequest, mockContext);
        expect(llmRequest.contents).toEqual(originalContents);
    });

     test('USER MESSAGE event with existing role in content should still be forced to user role', async () => {
        const userMessageContent: Content = { role: 'model', parts: [{ text: 'I am user but content says model' }] }; // Incorrect role in content
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'USER', name: 'test-user' }, data: { content: userMessageContent }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        llmRequest.contents = [];
        
        await processor.processRequest(llmRequest, mockContext);
        
        expect(llmRequest.contents).toEqual([{ role: 'user', parts: [{ text: 'I am user but content says model' }] }]);
    });

    test('AGENT MESSAGE event with existing user role in content should be forced to model role', async () => {
        // This scenario is less likely, but tests the priority logic.
        // The implementation currently trusts event.source.type for MESSAGE events if no role is set in content, 
        // or if content.role exists it will try to keep it unless it's a USER MESSAGE.
        // The current implementation will make agent messages 'model'. If content had 'user' role, it would be changed.
        const agentMessageContent: Content = { role: 'user', parts: [{ text: 'I am agent but content says user' }] }; 
        mockContext.session.events = [
            { eventId: 'e1', type: EventType.MESSAGE, source: { type: 'AGENT', name: 'test-agent' }, data: { content: agentMessageContent }, timestamp: new Date(), interactionId: 'i1', sessionId: 's1' },
        ];
        llmRequest.contents = [];
        
        await processor.processRequest(llmRequest, mockContext);
        
        expect(llmRequest.contents).toEqual([{ role: 'model', parts: [{ text: 'I am agent but content says user' }] }]);
    });

}); 