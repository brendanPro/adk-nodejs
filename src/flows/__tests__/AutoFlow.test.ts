import { AutoFlow, AutoFlowConfig } from '../AutoFlow.js';
import { IBaseLlm, LlmRequest, LlmResponse, Content, Part as AdkPart, FunctionCall, FunctionResponse, Candidate } from '../../models/index.js';
import { InvocationContext, InvocationServices } from '../../common/InvocationContext.js';
import { Session } from '../../common/Session.js';
import { RunConfig } from '../../common/RunConfig.js';
import { Event, EventType, EventSourceType, EventActions } from '../../common/Event.js';
import { IToolset, ITool } from '../../tools/index.js';
import { ILlmRequestProcessor, ILlmResponseProcessor } from '../FlowProcessor.js';
import { IAgent } from '../../agents/IAgent.js';
import { ILlmRegistry } from '../../llm/ILlmRegistry.js';
import { ISessionService } from '../../services/ISessionService.js';
import { IArtifactService } from '../../services/IArtifactService.js';
import { IMemoryService } from '../../services/IMemoryService.js';

// Mocks
const mockLlmGenerateContentAsync = jest.fn();
const mockLlm: IBaseLlm = {
    modelNamePattern: 'mock-llm',
    generateContentAsync: mockLlmGenerateContentAsync,
    generateContentStreamAsync: jest.fn(), // Required by IBaseLlm
    countTokensAsync: jest.fn(),      // Required by IBaseLlm
    // Add other methods if IBaseLlm requires more
};

const mockLlmRegistry: jest.Mocked<ILlmRegistry> = {
    registerLlm: jest.fn(),
    getLlm: jest.fn().mockResolvedValue(mockLlm),
    listLlms: jest.fn().mockReturnValue([]),
    unregisterLlm: jest.fn().mockReturnValue(true),
};

const mockGetFunctionDeclarations = jest.fn();
const mockToolset: IToolset = {
    name: 'mock-toolset',
    getTools: jest.fn(),
    getTool: jest.fn(),
    addTool: jest.fn(),
    removeTool: jest.fn(),
    getFunctionDeclarations: mockGetFunctionDeclarations,
    executeTool: jest.fn().mockImplementation(async function(this: IToolset, toolName: string, toolArgs: any, context: InvocationContext) {
        const tool = (this.getTool as jest.Mock)(toolName);
        if (tool && typeof tool.execute === 'function') {
            return tool.execute(toolArgs, context);
        }
        throw new Error(`Mock toolset: Tool ${toolName} not found or execute not implemented.`);
    }),
};

const mockTool: ITool = {
    name: 'get_weather', // Default name, can be overridden in specific tests if needed
    description: 'Mock weather tool',
    parametersSchema: { type: 'OBJECT' as any, properties: { location: { type: 'STRING' as any } } },
    execute: jest.fn(),
    asFunctionDeclaration: jest.fn().mockImplementation(function(this: ITool) { // Use function to access this.name
        return Promise.resolve({ 
            name: this.name, 
            description: this.description, 
            parameters: this.parametersSchema 
        });
    }),
};

// Helper to create a default RunConfig
const createMockRunConfig = (): RunConfig => ({
    agentName: 'MockAutoFlowAgent',
    input: { parts: [{ text: 'initial input' }] },
    appName: 'test-app-in-runconfig',
    defaultModelName: 'mock-model-from-runconfig'
});

// Helper to create InvocationContext
const createMockSession = (events: Event[] = []): Session => ({
    id: 'test-session-id',
    userId: 'test-user-id',
    appName: 'test-app',
    createdAt: new Date(),
    updatedAt: new Date(),
    events: [...events],
    state: new (jest.requireActual('../../common/Session.js').SessionState)(), // Use actual SessionState for internal methods if any
});

const createMockInvocationContext = (session?: Session, agentConfig?: any, runConfig?: RunConfig): InvocationContext => {
    const baseRunConfig: RunConfig = {
        agentName: agentConfig?.name || 'TestAgentInAutoFlow',
        input: { parts: [{ text: 'default auto flow context input' }] },
        defaultModelName: agentConfig?.llmConfig?.modelName || 'mock-llm-auto-context',
        appName: session?.appName || 'test-app-auto-context',
    };
    const services: InvocationServices = {
        sessionService: {} as jest.Mocked<ISessionService>,
        artifactService: {} as jest.Mocked<IArtifactService>,
        memoryService: {} as jest.Mocked<IMemoryService>,
        llmRegistry: mockLlmRegistry,
    };
    return {
        invocationId: `inv-${Date.now()}`,
        agent: {
            name: 'TestAgent',
            description: 'A test agent',
            llmConfig: { 
                systemInstruction: 'Default system instruction from mock agent',
                modelName: 'mock-llm',
                ...(agentConfig?.llmConfig || {})
            },
            toolset: undefined, 
            ...(agentConfig || {}),
            runAsync: jest.fn(),
            findAgent: jest.fn(),
            getRootAgent: jest.fn().mockReturnThis(),
            subAgents: [],
        } as IAgent,
        session: session || createMockSession(),
        runConfig: runConfig || baseRunConfig,
        services: services,
    };
};

// Helper for initial LlmRequest
const createInitialTestLlmRequest = (text = 'Hello'): LlmRequest => ({
    model: 'mock-llm',
    contents: [{ role: 'user', parts: [{ text }] }],
    // requestId will be added by flow.createInitialLlmRequest
});

// Helper for LlmResponse
const createMockLlmResponse = (text?: string, functionCalls?: FunctionCall[], toolResults?: FunctionResponse[]): LlmResponse => {
    const parts: AdkPart[] = [];
    if (text) {
        parts.push({ text });
    }
    if (functionCalls) {
        functionCalls.forEach(fc => parts.push({ functionCall: fc }));
    }
    if (toolResults) {
        toolResults.forEach(tr => parts.push({ functionResponse: tr }));
    }

    const candidate: Candidate = {
        index: 0,
        content: { role: 'model', parts },
        finishReason: functionCalls && functionCalls.length > 0 ? 'TOOL_CALLS' : 'STOP',
    };
    return {
        model: 'mock-llm',
        candidates: [candidate],
        usageMetadata: { totalTokens: 10, promptTokenCount: 5, candidatesTokenCount: 5}
    };
};


describe('AutoFlow', () => {
    let autoFlow: AutoFlow;
    let mockContext: InvocationContext;
    let mockTestSpecificLlmRegistry: jest.Mocked<ILlmRegistry>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockTestSpecificLlmRegistry = {
            registerLlm: jest.fn(),
            getLlm: jest.fn().mockResolvedValue(mockLlm),
            listLlms: jest.fn().mockReturnValue([]),
            unregisterLlm: jest.fn().mockReturnValue(true),
        };
        mockContext = createMockInvocationContext();
        mockContext.services!.llmRegistry = mockTestSpecificLlmRegistry;

        autoFlow = new AutoFlow({ maxInteractions: 3, historyMaxTurns: 5 }, undefined, mockTestSpecificLlmRegistry);
        mockLlmGenerateContentAsync.mockResolvedValue(createMockLlmResponse('LLM says hi'));
    });

    test('constructor should initialize with default processors and config', () => {
        const flowWithNoToolset = new AutoFlow({ maxInteractions: 5 }, undefined, mockTestSpecificLlmRegistry);
        expect(flowWithNoToolset.name).toBe('AutoFlow');
        expect((flowWithNoToolset as any).autoConfig.maxInteractions).toBe(5);
        expect(flowWithNoToolset.requestProcessors.some(p => p.constructor.name === 'InstructionsRequestProcessor')).toBe(true);
        expect(flowWithNoToolset.requestProcessors.some(p => p.constructor.name === 'HistoryRequestProcessor')).toBe(true);
        expect(flowWithNoToolset.responseProcessors.length).toBe(0);

        const flowWithToolset = new AutoFlow({ maxInteractions: 5 }, mockToolset, mockTestSpecificLlmRegistry);
        expect(flowWithToolset.requestProcessors.some(p => p.constructor.name === 'FunctionRequestProcessor')).toBe(true);
        expect(flowWithToolset.responseProcessors.some(p => p.constructor.name === 'FunctionResponseProcessor')).toBe(true);
    });

    test('should complete in a single turn with no tools if LLM provides a direct answer', async () => {
        const initialUserMessage = 'Tell me a joke.';
        const llmJokeResponse = 'Why did the chicken cross the road? To get to the other side!';
        
        mockLlmGenerateContentAsync.mockResolvedValue(createMockLlmResponse(llmJokeResponse));
        
        const initialRequest = autoFlow.createInitialLlmRequest(mockLlm.modelNamePattern, mockContext);
        initialRequest.contents = [{ role: 'user', parts: [{ text: initialUserMessage }] }];

        const finalEvent = await autoFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(1);
        
        const llmCallArgs = mockLlmGenerateContentAsync.mock.calls[0][0] as LlmRequest;
        expect(llmCallArgs.contents.some(c => c.role === 'system')).toBe(true);

        expect(finalEvent.type).toBe(EventType.LLM_RESPONSE);
        expect(finalEvent.data?.content?.parts?.[0]?.text).toBe(llmJokeResponse);
        expect(finalEvent.source?.type).toBe('LLM');
        expect(finalEvent.source?.name).toBe(mockLlm.modelNamePattern);
        expect(finalEvent.llmResponse?.candidates?.[0]?.content?.parts?.[0]?.text).toBe(llmJokeResponse);

        expect(mockContext.session.events.length).toBe(2); 
        expect(mockContext.session.events[0].type).toBe(EventType.LLM_REQUEST);
        expect(mockContext.session.events[1].type).toBe(EventType.LLM_RESPONSE);
        expect(mockContext.session.events[1].data?.content?.parts?.[0]?.text).toBe(llmJokeResponse);

        expect(mockGetFunctionDeclarations).not.toHaveBeenCalled();
    });

    test('should stop after maxInteractions with only text responses, meaning 1 actual LLM call', async () => {
        const maxInteractions = 2; // Configured maxInteractions
        autoFlow = new AutoFlow({ maxInteractions, historyMaxTurns: 5 }, undefined, mockTestSpecificLlmRegistry); // No toolset for this specific scenario

        const llmResponseText = 'LLM is still talking...';
        mockLlmGenerateContentAsync.mockResolvedValue(createMockLlmResponse(llmResponseText));

        const initialRequest = autoFlow.createInitialLlmRequest(mockLlm.modelNamePattern, mockContext);
        initialRequest.contents = [{ role: 'user', parts: [{ text: 'Keep talking' }] }];

        const finalEvent = await autoFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

        // AutoFlow breaks after the first LlmResponse if no tools are involved.
        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(1); 
        expect(finalEvent.type).toBe(EventType.LLM_RESPONSE);
        expect(finalEvent.data?.content?.parts?.[0]?.text).toBe(llmResponseText);
        // flowTerminationReason should NOT be MAX_INTERACTIONS because the flow terminated due to a final text response.
        expect((finalEvent.actions as any)?.flowTerminationReason).toBeUndefined();

        // Session events: LLM_REQUEST, LLM_RESPONSE
        expect(mockContext.session.events.length).toBe(2);
        expect(mockContext.session.events[0].type).toBe(EventType.LLM_REQUEST);
        expect(mockContext.session.events[1].type).toBe(EventType.LLM_RESPONSE);
    });

    test('should correctly reach maxInteractions when tool calls force continuation', async () => {
        const maxInteractions = 2;
        autoFlow = new AutoFlow({ maxInteractions, historyMaxTurns: 5 }, mockToolset, mockTestSpecificLlmRegistry);
        mockContext.agent.toolset = mockToolset;
        mockContext.services!.llmRegistry = mockTestSpecificLlmRegistry;
        (mockTestSpecificLlmRegistry.getLlm as jest.Mock).mockResolvedValue(mockLlm);

        const dummyToolCall: FunctionCall = { name: 'dummy_tool', args: {} };
        const dummyToolResultContent: Content = { role: 'tool', parts: [{ text: 'tool executed'}] };
        const mockDummyTool: ITool = { 
            ...mockTool, 
            name: 'dummy_tool', 
            description: 'A dummy tool',
            execute: jest.fn().mockResolvedValue(dummyToolResultContent) 
        };

        mockLlmGenerateContentAsync.mockResolvedValue(createMockLlmResponse(undefined, [dummyToolCall]));
        (mockToolset.getTool as jest.Mock).mockImplementation(name => (name === 'dummy_tool' ? mockDummyTool : undefined));
        mockGetFunctionDeclarations.mockResolvedValue([await mockDummyTool.asFunctionDeclaration()]);

        const initialRequest = autoFlow.createInitialLlmRequest(mockLlm.modelNamePattern, mockContext);
        initialRequest.contents = [{ role: 'user', parts: [{text: 'Start tool loop'}] }];

        const finalEvent = await autoFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(maxInteractions);
        expect(mockDummyTool.execute).toHaveBeenCalledTimes(maxInteractions);
        
        expect(finalEvent.type).toBe(EventType.TOOL_RESPONSE);
        expect((finalEvent.actions as any)?.flowTerminationReason).toBe('MAX_INTERACTIONS');
        
        // Session events: Per interaction: LLM_REQUEST, TOOL_RESPONSE
        expect(mockContext.session.events.length).toBe(maxInteractions * 2);
        for (let i = 0; i < maxInteractions; i++) {
            const baseIdx = i * 2;
            expect(mockContext.session.events[baseIdx].type).toBe(EventType.LLM_REQUEST);
            // The LlmResponse with the tool call is embedded in the TOOL_RESPONSE event by FunctionResponseProcessor
            expect(mockContext.session.events[baseIdx + 1].type).toBe(EventType.TOOL_RESPONSE);
            expect(mockContext.session.events[baseIdx + 1].llmResponse?.candidates?.[0].content?.parts?.some(p => p.functionCall?.name === dummyToolCall.name)).toBe(true);
            expect(mockContext.session.events[baseIdx + 1].data?.content?.parts?.[0].functionResponse?.response).toEqual(dummyToolResultContent);
        }
    });

    test('should handle a single tool call and response leading to a final answer', async () => {
        const initialUserMessage = 'What is the weather in London?';

        // Simulate initial user message being in session history, as HistoryRequestProcessor expects
        const initialUserEvent: Event = {
            eventId: 'user-event-0',
            interactionId: mockContext.invocationId,
            sessionId: mockContext.session.id,
            userId: mockContext.session.userId,
            appName: mockContext.session.appName,
            type: EventType.MESSAGE,
            source: { type: 'USER', name: 'test-user' },
            timestamp: new Date(Date.now() - 1000), // Ensure it's before other events
            data: { content: { role: 'user', parts: [{ text: initialUserMessage }] } }
        };
        mockContext.session.events.push(initialUserEvent);

        autoFlow = new AutoFlow({ maxInteractions: 3, historyMaxTurns: 5 }, mockToolset, mockTestSpecificLlmRegistry);
        mockContext.agent.toolset = mockToolset;

        const toolName = 'get_weather';
        const toolArgs = { location: 'London' };
        const toolCall: FunctionCall = { name: toolName, args: toolArgs };
        const toolResultText = 'The weather in London is sunny.';
        const toolResultContent: Content = { role: 'tool', parts: [{ text: toolResultText }] };
        const finalLlmAnswer = 'The weather in London is sunny, according to the tool.';

        const specificWeatherTool: ITool = {
            ...mockTool,
            name: toolName,
            description: 'Gets weather',
            parametersSchema: { type: 'OBJECT' as any, properties: { location: { type: 'STRING' as any } } },
            execute: jest.fn().mockResolvedValue(toolResultContent)
        };

        mockLlmGenerateContentAsync
            .mockResolvedValueOnce(createMockLlmResponse(undefined, [toolCall]))
            .mockResolvedValueOnce(createMockLlmResponse(finalLlmAnswer));

        (mockToolset.getTool as jest.Mock).mockImplementation(name => (name === toolName ? specificWeatherTool : undefined));
        mockGetFunctionDeclarations.mockResolvedValue([await specificWeatherTool.asFunctionDeclaration()]);

        // AutoFlow's initialRequest.contents will be combined with history by HistoryRequestProcessor
        // For this test, since the user message is already in session.events, 
        // initialRequest.contents can be empty or just system instructions if any.
        // However, AutoFlow.createInitialLlmRequest doesn't inherently take user text.
        // The user message from initialUserEvent should be picked by HistoryRequestProcessor.
        const initialRequest = autoFlow.createInitialLlmRequest(mockLlm.modelNamePattern, mockContext);
        // We don't need to set initialRequest.contents[{role:'user'...}] here, 
        // as HistoryRequestProcessor will get it from mockContext.session.events.

        const finalEvent = await autoFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(2);
        expect(mockGetFunctionDeclarations).toHaveBeenCalledTimes(2); 
        expect(mockToolset.getTool).toHaveBeenCalledWith(toolName);
        expect(specificWeatherTool.execute).toHaveBeenCalledTimes(1); 
        expect(specificWeatherTool.execute).toHaveBeenCalledWith(toolArgs, expect.any(Object)); 

        expect(finalEvent.type).toBe(EventType.LLM_RESPONSE);
        expect(finalEvent.data?.content?.parts?.[0]?.text).toBe(finalLlmAnswer);
        
        // Session events: initialUserEvent, LLM_REQ_1, TOOL_RESP_1, LLM_REQ_2, LLM_RESP_2
        // Total 5 events now
        expect(mockContext.session.events.length).toBe(5);
        expect(mockContext.session.events[0].type).toBe(EventType.MESSAGE);
        expect(mockContext.session.events[0].data?.content?.parts[0].text).toBe(initialUserMessage);
        // Event 1: First LLM Request (triggers tool call)
        expect(mockContext.session.events[1].type).toBe(EventType.LLM_REQUEST);
        // Event 2: Tool Response 
        expect(mockContext.session.events[2].type).toBe(EventType.TOOL_RESPONSE);
        // Event 3: Second LLM Request
        expect(mockContext.session.events[3].type).toBe(EventType.LLM_REQUEST);
        // Event 4: Final LLM Response
        expect(mockContext.session.events[4].type).toBe(EventType.LLM_RESPONSE);

        const processedSecondLlmReq = mockLlmGenerateContentAsync.mock.calls[1][0] as LlmRequest;
        expect(processedSecondLlmReq.contents.some(c =>
            c.role === 'tool' &&
            c.parts.some(p => p.functionResponse?.name === toolName && p.functionResponse.response.parts[0].text === toolResultText)
        )).toBe(true);
        expect(processedSecondLlmReq.contents.some(c => c.role === 'user' && c.parts[0].text === initialUserMessage)).toBe(true);
    });

    // More tests will be added here
}); 