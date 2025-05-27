import { Runner, AgentFactory } from '../Runner.js';
import { ISessionService } from '../services/ISessionService.js';
import { IArtifactService } from '../services/IArtifactService.js';
import { IMemoryService } from '../services/IMemoryService.js';
import { IAgent } from '../agents/IAgent.js';
import { InvocationContext } from '../common/InvocationContext.js';
import { RunConfig, RunOutput } from '../common/RunConfig.js';
import { Session, SessionState } from '../common/Session.js';
import { Event, EventType, EventSource, EventData } from '../common/Event.js';
import { Content, FunctionCall, Part, FunctionResponse as AdkFunctionResponse } from '../models/LlmContent.js';
import { ILlmRegistry } from '../llm/ILlmRegistry.js';
import { IBaseLlm, LlmRequest, LlmResponse } from '../models/index.js'; 
import { ICodeExecutor } from '../services/ICodeExecutor.js';
import { LocalCodeExecutor } from '../services/LocalCodeExecutor.js';
import { LlmAgent, LlmAgentProps } from '../agents/LlmAgent.js';
import { SingleFlow } from '../flows/SingleFlow.js';
import { CodeExecutionTool } from '../tools/CodeExecutionTool.js';
import { BaseToolset } from '../tools/BaseToolset.js';
import { CODE_EXECUTION_TOOL_NAME } from '../flows/processors/CodeExecutionRequestProcessor.js';

// Mock Services
const mockGetSession = jest.fn();
const mockCreateSession = jest.fn();
const mockAppendEvent = jest.fn();
const mockUpdateSessionState = jest.fn();
const mockSessionService: ISessionService = {
    getSession: mockGetSession,
    createSession: mockCreateSession,
    appendEvent: mockAppendEvent,
    updateSessionState: mockUpdateSessionState,
    listSessions: jest.fn(), 
    deleteSession: jest.fn(), 
    clearAllSessions: jest.fn(),
};

const mockSaveArtifact = jest.fn();
const mockArtifactService: IArtifactService = {
    saveArtifact: mockSaveArtifact,
    getArtifact: jest.fn(),
    listArtifacts: jest.fn(),
    deleteArtifact: jest.fn(),
};

const mockMemoryService: IMemoryService = {
    addEventsToHistory: jest.fn(),
    addMemory: jest.fn(),
    searchMemory: jest.fn(),
    deleteMemory: jest.fn(),
    retrieveMemory: jest.fn(),
};

// Mock LLM for flow
const mockLlmGenerateContentAsync = jest.fn();
const mockFlowLlm: jest.Mocked<IBaseLlm> = {
    generateContentAsync: mockLlmGenerateContentAsync,
    generateContentStreamAsync: jest.fn(),
    countTokensAsync: jest.fn(),
    modelNamePattern: 'mock-flow-llm',
};

const mockLlmRegistry: jest.Mocked<ILlmRegistry> = {
    registerLlm: jest.fn(),
    getLlm: jest.fn().mockResolvedValue(mockFlowLlm), 
    listLlms: jest.fn().mockReturnValue([]),
    unregisterLlm: jest.fn().mockReturnValue(true),
};

const mockCodeExecutorService: jest.Mocked<ICodeExecutor> = {
    execute: jest.fn(),
};

const localCodeExecutor = new LocalCodeExecutor(); 

const mockAgentRunAsyncGenerator = jest.fn();
const baseMockAgent: IAgent = {
    name: 'TestAgent',
    description: 'A test agent',
    llmConfig: { modelName: 'test-model' },
    subAgents: [],
    findAgent: jest.fn(),
    getRootAgent: jest.fn().mockReturnThis(),
    runAsync: mockAgentRunAsyncGenerator, 
};

let createdAgent: LlmAgent | undefined;

// Define the default implementation for the agent factory
const defaultAgentFactoryImplementation = async (agentName: string, runConfig: RunConfig, invocationContext: InvocationContext): Promise<IAgent | undefined> => {
    if (agentName === 'CodeExecAgent') {
        const toolset = new BaseToolset({ name: 'CodeExecToolset' });
        const codeTool = new CodeExecutionTool(invocationContext.services?.codeExecutor); 
        toolset.addTool(codeTool);
        
        const flow = new SingleFlow(undefined, undefined, invocationContext.services?.llmRegistry);
        const agentProps: LlmAgentProps = {
            name: agentName,
            description: 'Agent that can execute code',
            flow: flow,
            toolset: toolset,
            llmConfig: { modelName: 'mock-flow-llm' } 
        };
        createdAgent = new LlmAgent(agentProps);
        return createdAgent;
    }
    baseMockAgent.llmConfig = { modelName: 'test-model' }; 
    return baseMockAgent; 
};

const mockAgentFactory: jest.MockedFunction<AgentFactory> = jest.fn(defaultAgentFactoryImplementation);

const defaultAppName = 'test-runner-app';
const defaultInteractionId = 'test-interaction-id';
const defaultAgentSource: EventSource = { type: 'AGENT', name: baseMockAgent.name };

// Helper function to create a complete mock event
const createMockEvent = (sessionId: string, eventId: string, type: EventType, data?: EventData, source?: EventSource, interactionId?: string): Event => ({
    eventId,
    type,
    timestamp: new Date(),
    interactionId: interactionId || defaultInteractionId,
    sessionId,
    source: source || defaultAgentSource,
    data,
});

async function consumeRunnerOutput(
    generator: AsyncGenerator<Event, RunOutput, undefined>
): Promise<{ yieldedEvents: Event[], finalOutput: RunOutput }> {
    const yieldedEvents: Event[] = [];
    let result = await generator.next();
    while (!result.done) {
        if (result.value) { 
            yieldedEvents.push(result.value);
        }
        result = await generator.next();
    }
    return { yieldedEvents, finalOutput: result.value as RunOutput }; 
}

describe('Runner', () => {
    let runner: Runner;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLlmGenerateContentAsync.mockReset();
        mockCodeExecutorService.execute.mockReset(); 
        createdAgent = undefined; 
        mockAgentFactory.mockImplementation(defaultAgentFactoryImplementation);
        runner = new Runner(mockSessionService, mockArtifactService, mockMemoryService, mockAgentFactory, mockLlmRegistry, localCodeExecutor, defaultAppName);
    });

    const createMinimalRunConfig = (agentName: string, input: string | Content = 'hello'): RunConfig => ({
        agentName,
        input,
        userId: 'test-user',
        defaultModelName: 'mock-flow-llm',
        interactionId: defaultInteractionId,
    });

    test('should create session if none exists', async () => {
        const runConfig = createMinimalRunConfig('TestAgent');
        const sessionId = 's1';
        mockGetSession.mockResolvedValue(null);
        const newSession: Session = { id: sessionId, userId: 'u1', appName: defaultAppName, events: [], state: new SessionState(), createdAt: new Date(), updatedAt: new Date() };
        mockCreateSession.mockResolvedValue(newSession);
        
        const agentYieldEvent = createMockEvent(sessionId, 'event1', EventType.MESSAGE, { message: 'agent progress' }, defaultAgentSource, runConfig.interactionId);
        const agentFinalEvent = createMockEvent(sessionId, 'final-event', EventType.MESSAGE, { message: 'agent done' }, defaultAgentSource, runConfig.interactionId);
        
        baseMockAgent.runAsync = jest.fn().mockImplementation(async function*() { 
            yield agentYieldEvent; 
            return agentFinalEvent; 
        });

        await consumeRunnerOutput(runner.runAgent(runConfig));
        expect(mockCreateSession).toHaveBeenCalledWith(runConfig.userId, defaultAppName);
        expect(baseMockAgent.runAsync).toHaveBeenCalled();
    });

    test('should use existing session if one is found', async () => {
        const runConfig = createMinimalRunConfig('TestAgent');
        const sessionId = 's2';
        runConfig.sessionId = sessionId;
        const existingSession: Session = { id: sessionId, userId: 'u2', appName: defaultAppName, events: [], state: new SessionState(), createdAt: new Date(), updatedAt: new Date() };
        mockGetSession.mockResolvedValue(existingSession);

        const agentYieldEvent = createMockEvent(sessionId, 'event2', EventType.MESSAGE, { message: 'agent progress again' }, defaultAgentSource, runConfig.interactionId);
        const agentFinalEvent = createMockEvent(sessionId, 'final-event2', EventType.MESSAGE, { message: 'agent done again' }, defaultAgentSource, runConfig.interactionId);

        baseMockAgent.runAsync = jest.fn().mockImplementation(async function*() { 
            yield agentYieldEvent; 
            return agentFinalEvent; 
        });

        await consumeRunnerOutput(runner.runAgent(runConfig));
        expect(mockGetSession).toHaveBeenCalledWith(sessionId);
        expect(mockCreateSession).not.toHaveBeenCalled();
        expect(baseMockAgent.runAsync).toHaveBeenCalled();
    });

    test('should persist and track events during agent run', async () => {
        const runConfig = createMinimalRunConfig('TestAgent');
        const sessionId = 's3';
        runConfig.sessionId = sessionId;

        const session: Session = { id: sessionId, userId: 'u3', appName: defaultAppName, events: [], state: new SessionState(), createdAt: new Date(), updatedAt: new Date() };
        mockGetSession.mockResolvedValue(session);
        mockAppendEvent.mockImplementation((_sid, ev) => { session.events.push(ev); return Promise.resolve(session); });

        const agentEvent1 = createMockEvent(sessionId, 'ae1', EventType.MESSAGE, { message: 'Agent says something' }, defaultAgentSource, runConfig.interactionId);
        const agentEvent2 = createMockEvent(sessionId, 'ae2', EventType.CUSTOM, { message: "Thought: Agent is thinking" }, defaultAgentSource, runConfig.interactionId); 
        const agentFinalOutputEvent = createMockEvent(sessionId, 'afe3', EventType.MESSAGE, { message: 'Agent finished' }, defaultAgentSource, runConfig.interactionId);
        
        baseMockAgent.runAsync = jest.fn().mockImplementation(async function*() {
            yield agentEvent1;
            yield agentEvent2;
            return agentFinalOutputEvent;
        });

        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        expect(baseMockAgent.runAsync).toHaveBeenCalled();
        expect(yieldedEvents).toEqual(expect.arrayContaining([agentEvent1, agentEvent2, agentFinalOutputEvent]));
        expect(yieldedEvents.find(e => e.type === EventType.RUN_START)).toBeDefined();
        expect(yieldedEvents.find(e => e.type === EventType.RUN_COMPLETE)).toBeDefined();
        
        expect(finalOutput.output).toEqual(agentFinalOutputEvent.data);
        const runCompleteEventInSession = session.events.find(e => e.type === EventType.RUN_COMPLETE);
        expect(runCompleteEventInSession).toBeDefined();
        expect((runCompleteEventInSession?.data as any)?.output).toEqual(agentFinalOutputEvent.data);

        // Adjusted expectation: RUN_START, ae1, ae2, agentFinalOutputEvent (if new), RUN_COMPLETE
        expect(mockAppendEvent).toHaveBeenCalledTimes(5); 
        expect(session.events.find(e => e.eventId === agentEvent1.eventId)).toBeDefined();
        expect(session.events.find(e => e.eventId === agentEvent2.eventId)).toBeDefined();
        
        const runStartEvent = session.events.find(e => e.type === EventType.RUN_START);
        expect(runStartEvent).toBeDefined();
        expect((runStartEvent?.data as any)?.input).toEqual(runConfig.input); 

        const runCompleteEvent = session.events.find(e => e.type === EventType.RUN_COMPLETE);
        expect(runCompleteEvent).toBeDefined();
        expect((runCompleteEvent?.data as any)?.output).toEqual(agentFinalOutputEvent.data);
        expect(runCompleteEvent?.eventId).not.toBe(agentFinalOutputEvent.eventId); 
    });

    test('should handle agent error and persist error event', async () => {
        const runConfig = createMinimalRunConfig('TestAgent');
        const sessionId = 's4';
        const sessionToCreate: Session = { id: sessionId, userId: runConfig.userId!, appName: defaultAppName, events: [], state: new SessionState(), createdAt: new Date(), updatedAt: new Date() };
        
        mockCreateSession.mockResolvedValue(sessionToCreate);
        mockGetSession.mockResolvedValue(null); 

        mockAppendEvent.mockImplementation((_sid, ev) => { 
            const currentEvents = sessionToCreate.events || [];
            sessionToCreate.events = [...currentEvents, ev];
            return Promise.resolve(sessionToCreate); 
        });

        const agentError = new Error('Agent failed!');
        const agentYieldedEventOnError = createMockEvent(sessionId, 'start-event', EventType.MESSAGE, { message: 'About to fail' }, defaultAgentSource, runConfig.interactionId);

        baseMockAgent.runAsync = jest.fn().mockImplementation(async function*() {
            yield agentYieldedEventOnError;
            throw agentError;
        });

        const { finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        expect(baseMockAgent.runAsync).toHaveBeenCalled();
        expect(finalOutput.error).toBeDefined();
        expect(finalOutput.error?.message).toBe('Agent failed!');
        expect(mockAppendEvent).toHaveBeenCalledTimes(4); 
        
        const errorEvent = sessionToCreate.events.find(e => e.type === EventType.ERROR);
        expect(errorEvent).toBeDefined();
        expect(errorEvent?.data?.error?.message).toBe('Agent failed!'); 
        expect((errorEvent?.data as any)?.originalError).toBe(agentError); 
    });

    test('old test using baseMockAgent', async () => {
        const runConfig = createMinimalRunConfig('TestAgent'); 
        const sessionId = 's1-old';
        mockGetSession.mockResolvedValue(null);
        const newSession: Session = { id: sessionId, userId: 'u1', appName: defaultAppName, events: [], state: new SessionState(), createdAt: new Date(), updatedAt: new Date() };
        mockCreateSession.mockResolvedValue(newSession);

        const agentYieldEvent = createMockEvent(sessionId, 'base-agent-event', EventType.MESSAGE, { message: 'base progress' }, defaultAgentSource, runConfig.interactionId);
        const agentFinalEvent = createMockEvent(sessionId, 'base-agent-final', EventType.MESSAGE, { message: 'base done' }, defaultAgentSource, runConfig.interactionId);

        baseMockAgent.runAsync = jest.fn().mockImplementation(async function*() { 
            yield agentYieldEvent;
            return agentFinalEvent; 
        });
        
        await consumeRunnerOutput(runner.runAgent(runConfig));
        expect(baseMockAgent.runAsync).toHaveBeenCalled(); 
    });

    test('should successfully run agent, creating a new session, yielding events and returning RunOutput', async () => {
        const runConfig = createMinimalRunConfig('TestAgent'); 
        const newSessionId = 'new-session-123';
        runConfig.sessionId = newSessionId;
        const mockNewSession: Session = {
            id: newSessionId,
            userId: runConfig.userId!,
            appName: defaultAppName,
            createdAt: new Date(),
            updatedAt: new Date(),
            state: new SessionState(),
            events: [],
        };

        mockGetSession.mockResolvedValue(null);
        mockCreateSession.mockResolvedValue(mockNewSession);
        
        const agentInternalEvent = createMockEvent(newSessionId, 'agent-event-1', EventType.CUSTOM, { message: 'Agent did something' }, defaultAgentSource, runConfig.interactionId);
        const finalAgentReturnEvent = createMockEvent(newSessionId, 'agent-final-event', EventType.MESSAGE, { content: { parts: [{text: 'agent output'}] } }, defaultAgentSource, runConfig.interactionId ) as Event;
        
        baseMockAgent.runAsync = jest.fn().mockImplementation(async function* (context: InvocationContext) {
            context.session.events.push(agentInternalEvent);
            context.session.state.set('agentKey', 'agentValue');
            yield agentInternalEvent;
            return finalAgentReturnEvent;
        });
        
        mockAppendEvent.mockImplementation((_sessionId, event) => {
            const currentEvents = mockNewSession.events || [];
            mockNewSession.events = [...currentEvents, event];
            return Promise.resolve(mockNewSession);
        });
        mockUpdateSessionState.mockResolvedValue(mockNewSession);

        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        expect(mockCreateSession).toHaveBeenCalledWith(runConfig.userId, defaultAppName);
        expect(mockAgentFactory).toHaveBeenCalledWith('TestAgent', expect.objectContaining({appName: defaultAppName, sessionId: newSessionId}), expect.any(Object));
        expect(baseMockAgent.runAsync).toHaveBeenCalled();
        
        expect(finalOutput.sessionId).toBe(newSessionId);
        expect(finalOutput.error).toBeUndefined();
        expect(finalOutput.output).toEqual(finalAgentReturnEvent.data);
        expect(finalOutput.finalState?.get('agentKey')).toBe('agentValue');
        
        const sessionNotFoundEvent = yieldedEvents.find(e => e.type === EventType.SESSION_CREATE && e.data?.message?.includes('Specified session new-session-123 not found'));
        expect(sessionNotFoundEvent).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_START)).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.eventId === agentInternalEvent.eventId)).toBeDefined();
        if (yieldedEvents.find((e:Event) => e.eventId === finalAgentReturnEvent.eventId)) {
             expect(yieldedEvents.find((e:Event) => e.eventId === finalAgentReturnEvent.eventId)).toBeDefined();
        }
        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_COMPLETE)).toBeDefined();
        expect(finalOutput.events.find((e:Event) => e.eventId === finalAgentReturnEvent.eventId)).toBeDefined();

        expect(mockUpdateSessionState).toHaveBeenCalledWith(newSessionId, mockNewSession.state, expect.arrayContaining([expect.objectContaining({eventId: agentInternalEvent.eventId})]));
    });

    test('should use existing session, yield events and return RunOutput', async () => {
        const existingSessionId = 'existing-session-456';
        const runConfig = createMinimalRunConfig('TestAgent');
        runConfig.sessionId = existingSessionId;
        const mockExistingSession: Session = {
            id: existingSessionId,
            userId: runConfig.userId!,
            appName: defaultAppName,
            createdAt: new Date(Date.now() - 10000),
            updatedAt: new Date(Date.now() - 5000),
            state: new SessionState({ someKey: 'oldValue' }),
            events: [createMockEvent(existingSessionId, 'prev-event', EventType.MESSAGE, {content: {parts: [{text: 'previous message'}]}}, {type: 'USER', name: 'user'}, runConfig.interactionId)],
        };

        mockGetSession.mockResolvedValue(mockExistingSession);
        const agentReturnedEvent = createMockEvent(existingSessionId, 'agent-final-2', EventType.MESSAGE, { content: { parts: [{text: 'agent new output'}] } }, defaultAgentSource, runConfig.interactionId) as Event;
        
        baseMockAgent.runAsync = jest.fn().mockImplementation(async function* (context: InvocationContext) {
            context.session.state.set('newKey', 'newValue');
            return agentReturnedEvent;
        });
        mockAppendEvent.mockImplementation((_sessionId, event) => Promise.resolve({ ...mockExistingSession, events: [...mockExistingSession.events, event]}));
        mockUpdateSessionState.mockResolvedValue(mockExistingSession);

        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        expect(mockGetSession).toHaveBeenCalledWith(existingSessionId);
        expect(mockCreateSession).not.toHaveBeenCalled();
        expect(mockAgentFactory).toHaveBeenCalledWith('TestAgent', expect.objectContaining({sessionId: existingSessionId}), expect.any(Object));
        expect(baseMockAgent.runAsync).toHaveBeenCalled();
        expect(finalOutput.sessionId).toBe(existingSessionId);
        expect(finalOutput.error).toBeUndefined();
        expect(finalOutput.finalState?.get('someKey')).toBe('oldValue');
        expect(finalOutput.finalState?.get('newKey')).toBe('newValue');
        
        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_START)).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_COMPLETE)).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.eventId === agentReturnedEvent.eventId)).toBeDefined();
    });

    test('should return error if agent is not found, yielding appropriate events', async () => {
        const runConfig = createMinimalRunConfig('UnknownAgent');
        mockAgentFactory.mockImplementation(async () => undefined);
        const newSessionId = 'session-agent-not-found';
        const mockSession: Session = { id: newSessionId, userId: runConfig.userId!, appName: defaultAppName, createdAt: new Date(), updatedAt: new Date(), state: new SessionState(), events: [] }; 
        mockCreateSession.mockResolvedValue(mockSession);
        mockAppendEvent.mockImplementation((_sessionId, event) => Promise.resolve({ ...mockSession, events: [event]})); 

        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        expect(finalOutput.error).toBeDefined();
        expect(finalOutput.error?.message).toContain('Agent with name \'UnknownAgent\' not found');
        expect(yieldedEvents.find((e: Event) => e.type === EventType.ERROR)).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_START)).toBeDefined(); 
        expect(baseMockAgent.runAsync).not.toHaveBeenCalled(); 
        expect(mockUpdateSessionState).not.toHaveBeenCalled(); 
    });

    test('should return error if agent.runAsync throws, yielding appropriate events', async () => {
        const runConfig = createMinimalRunConfig('TestAgent');
        const agentErrorMessage = 'Agent failed!';
        const newSessionId = 'session-agent-error';
        const mockSession: Session = { id: newSessionId, userId: runConfig.userId!, appName: defaultAppName, createdAt: new Date(), updatedAt: new Date(), state: new SessionState(), events: [] }; 

        mockCreateSession.mockResolvedValue(mockSession);
        baseMockAgent.runAsync = jest.fn().mockImplementation(async function* () {
            throw new Error(agentErrorMessage);
        });
        mockAppendEvent.mockImplementation((_sessionId, event) => Promise.resolve({ ...mockSession, events: [event]})); 

        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        expect(finalOutput.error).toBeDefined();
        expect(finalOutput.error?.message).toBe(agentErrorMessage);
        expect(yieldedEvents.find((e: Event) => e.type === EventType.ERROR)).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_START)).toBeDefined();
        expect(baseMockAgent.runAsync).toHaveBeenCalled();
        expect(mockUpdateSessionState).not.toHaveBeenCalled(); 
    });

    test('should create a new session if specified sessionId is not found, yielding events', async () => {
        const initialRunConfig = createMinimalRunConfig('TestAgent');
        const originalNonExistentSessionId = 'non-existent-session-id';
        initialRunConfig.sessionId = originalNonExistentSessionId; 

        const newSessionId = 'newly-created-session-for-non-existent';
        const mockNewSession: Session = {
            id: newSessionId,
            userId: initialRunConfig.userId!,
            appName: defaultAppName, 
            createdAt: new Date(),
            updatedAt: new Date(),
            state: new SessionState(),
            events: [],
        };

        mockGetSession.mockResolvedValue(null); 
        mockCreateSession.mockResolvedValue(mockNewSession);
        
        const finalAgentEvent = createMockEvent(newSessionId, 'agent-event', EventType.MESSAGE, { content: { parts: [{text: 'agent output'}] } }, defaultAgentSource, initialRunConfig.interactionId) as Event;
        
        baseMockAgent.runAsync = jest.fn().mockImplementation(async function*() { return finalAgentEvent; });
        mockAppendEvent.mockImplementation((_sessionId, event) => {
            const currentEvents = mockNewSession.events || [];
            mockNewSession.events = [...currentEvents, event];
            return Promise.resolve(mockNewSession);
        });
        mockUpdateSessionState.mockResolvedValue(mockNewSession); 

        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(initialRunConfig));

        expect(mockGetSession).toHaveBeenCalledWith(originalNonExistentSessionId);
        expect(mockCreateSession).toHaveBeenCalledWith(initialRunConfig.userId, defaultAppName);

        const sessionCreationEvent = yieldedEvents.find((e: Event) => 
            e.type === EventType.SESSION_CREATE && 
            e.data && 
            typeof e.data.message === 'string' &&
            e.data.message.includes(`Specified session ${originalNonExistentSessionId} not found`)
        );
        expect(sessionCreationEvent).toBeDefined();
        expect(sessionCreationEvent?.data?.message).toMatch(/New session .* created/);
        expect(finalOutput.sessionId).toBe(newSessionId);

        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_START)).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.eventId === finalAgentEvent.eventId)).toBeDefined();
        expect(yieldedEvents.find((e: Event) => e.type === EventType.RUN_COMPLETE)).toBeDefined();
    });

    test('should run agent with code execution tool, processing LLM request for code and returning result', async () => {
        const runConfig = createMinimalRunConfig('CodeExecAgent', 'Calculate 2 + 2 using python');
        const sessionId = 'code-exec-session-123';
        const mockSessionData: Session = {
            id: sessionId, userId: runConfig.userId!, appName: defaultAppName,
            createdAt: new Date(), updatedAt: new Date(), state: new SessionState(), events: [],
        };
        mockGetSession.mockResolvedValue(null); 
        mockCreateSession.mockResolvedValue(mockSessionData);
        mockAppendEvent.mockImplementation((_sid, ev) => { 
            const currentEvents = mockSessionData.events || [];
            mockSessionData.events = [...currentEvents, ev];
            return Promise.resolve(mockSessionData); 
        });
        mockUpdateSessionState.mockResolvedValue(mockSessionData);

        const pythonCodeToExecute = 'print(2 + 2)';
        const codeExecutionArgs = { language: 'python', code: pythonCodeToExecute };

        const llmResponseWithFuncCall: LlmResponse = {
            model: 'mock-flow-llm',
            candidates: [{
                content: {
                    role: 'model',
                    parts: [{ functionCall: { name: CODE_EXECUTION_TOOL_NAME, args: codeExecutionArgs } }]
                },
                finishReason: 'TOOL_CALLS'
            }],
            metadata: { interactionId: runConfig.interactionId!, sessionId },
        };

        const finalLlmResponseText = 'The result of 2 + 2 is 4.';
        const llmResponseAfterTool: LlmResponse = {
            model: 'mock-flow-llm',
            candidates: [{
                content: { role: 'model', parts: [{ text: finalLlmResponseText }] },
                finishReason: 'STOP'
            }],
            metadata: { interactionId: runConfig.interactionId!, sessionId },
        };

        mockLlmGenerateContentAsync
            .mockResolvedValueOnce(llmResponseWithFuncCall)
            .mockResolvedValueOnce(llmResponseAfterTool);
        
        const localExecutorSpy = jest.spyOn(localCodeExecutor, 'execute');

        // Debug: Check createdAgent before runAgent is called
        // We expect defaultAgentFactoryImplementation to have set it via mockAgentFactory
        console.log('DEBUG: createdAgent before runner.runAgent in code exec test:', createdAgent === undefined ? 'undefined' : 'defined - ' + createdAgent?.name );

        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        // Debug: Check createdAgent after runAgent is called (it should have been set by the factory)
        console.log('DEBUG: createdAgent after runner.runAgent in code exec test:', createdAgent === undefined ? 'undefined' : 'defined - ' + createdAgent?.name );

        expect(mockAgentFactory).toHaveBeenCalledWith('CodeExecAgent', expect.any(Object), expect.any(Object));
        expect(createdAgent).toBeDefined(); // This assertion should pass now
        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(2);

        expect(localExecutorSpy).toHaveBeenCalledWith('python', pythonCodeToExecute, expect.any(Object));

        const firstLlmCallArgs = mockLlmGenerateContentAsync.mock.calls[0][0] as LlmRequest;
        console.log('DEBUG: firstLlmCallArgs.contents:', JSON.stringify(firstLlmCallArgs.contents, null, 2));
        expect(firstLlmCallArgs.contents.some(c => c.role === 'user' && c.parts[0].text?.includes('Calculate 2 + 2'))).toBe(true);
        expect(firstLlmCallArgs.tools?.some(t => t.functionDeclarations?.some(fd => fd.name === CODE_EXECUTION_TOOL_NAME))).toBe(true);

        const secondLlmCallArgs = mockLlmGenerateContentAsync.mock.calls[1][0] as LlmRequest;
        const toolResultContent = secondLlmCallArgs.contents.find(c => c.role === 'tool');
        expect(toolResultContent).toBeDefined();
        expect(toolResultContent?.parts[0].functionResponse?.name).toBe(CODE_EXECUTION_TOOL_NAME);
        expect(toolResultContent?.parts[0].functionResponse?.response.parts[0].text).toContain('Stdout:\n4'); 
        
        expect(yieldedEvents.find(e => e.type === EventType.LLM_REQUEST)).toBeDefined();
        const llmResponseEvent = yieldedEvents.find(e => e.type === EventType.LLM_RESPONSE && e.llmResponse === llmResponseWithFuncCall);
        expect(llmResponseEvent).toBeDefined(); 
        expect(llmResponseEvent?.interactionId).toBe(runConfig.interactionId);

        expect(finalOutput.error).toBeUndefined();
        expect(finalOutput.output?.content?.parts[0].text).toBe(finalLlmResponseText);
        expect(mockSessionData.events.length).toBeGreaterThanOrEqual(6); 
        mockSessionData.events.forEach(event => {
            expect(event.interactionId).toBe(runConfig.interactionId);
            expect(event.sessionId).toBe(sessionId);
        });

        localExecutorSpy.mockRestore();
    });
}); 