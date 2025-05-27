import { LlmAgent, LlmAgentProps } from '../LlmAgent.js';
import { BaseAgent } from '../BaseAgent.js';
import { IAgent } from '../IAgent.js';
import { IBaseLlmFlow } from '../../flows/IBaseLlmFlow.js';
import { SingleFlow } from '../../flows/SingleFlow.js';
import { IBaseLlm } from '../../models/IBaseLlm.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { LlmResponse } from '../../models/LlmResponse.js';
import { InvocationContext, InvocationServices } from '../../common/InvocationContext.js';
import { Event, EventType, EventSource, EventData } from '../../common/Event.js';
import { IToolset } from '../../tools/IToolset.js';
import { IMemoryService } from '../../services/IMemoryService.js';
import { ISessionService } from '../../services/ISessionService.js';
import { IArtifactService } from '../../services/IArtifactService.js';
import { ILlmRegistry } from '../../llm/ILlmRegistry.js';
import { LlmRegistry } from '../../llm/LlmRegistry.js';
import { Session, SessionState } from '../../common/Session.js';
import { RunConfig } from '../../common/RunConfig.js';
import { Content, AdkHarmCategory, AdkHarmBlockThreshold, SafetySetting, Tool } from '../../models/LlmContent.js';
import { CallbackContext } from '../../common/CallbackContext.js';

// Mocks
const mockLlm: jest.Mocked<IBaseLlm> = {
    generateContentAsync: jest.fn(),
    generateContentStreamAsync: jest.fn(),
    countTokensAsync: jest.fn(),
    modelNamePattern: 'mock-llm',
};

const mockLlmRegistry: jest.Mocked<ILlmRegistry> = {
    registerLlm: jest.fn(),
    getLlm: jest.fn().mockResolvedValue(mockLlm),
    listLlms: jest.fn().mockReturnValue([]),
    unregisterLlm: jest.fn().mockReturnValue(true),
};

// IBaseLlmFlow already includes name and description?: string
type MockFlowWithToolset = jest.Mocked<IBaseLlmFlow & { toolset?: IToolset }>;

// Removed unused global mockFlow variable that was causing type issues.

const mockToolset: jest.Mocked<IToolset> = {
    name: 'mock-toolset',
    getFunctionDeclarations: jest.fn(),
    executeTool: jest.fn(),
    getTool: jest.fn(),
    getTools: jest.fn(),
    addTool: jest.fn(),
    removeTool: jest.fn(),
};

const mockMemoryService: jest.Mocked<IMemoryService> = {
    addEventsToHistory: jest.fn(),
    addMemory: jest.fn(),
    searchMemory: jest.fn(),
    deleteMemory: jest.fn(),
    retrieveMemory: jest.fn(),
};

const defaultMockSessionBase: Omit<Session, 'events' | 'state' | 'updatedAt' | 'createdAt'> = {
    id: 'sess-123',
    userId: 'user-test',
    appName: 'test-app',
};

const createFreshMockSession = (): Session => ({
    ...defaultMockSessionBase,
    events: [],
    state: new SessionState(),
    createdAt: new Date(),
    updatedAt: new Date(),
});

const createMockInvocationContext = (
    agent: IAgent, 
    session?: Session, 
    runConfigOverrides?: Partial<RunConfig>
): InvocationContext => {
    const baseRunConfig: RunConfig = {
        agentName: agent.name || 'TestAgentFromContext',
        input: { parts: [{ text: 'default test input' }] },
        defaultModelName: 'test-model',
    };
    const currentSession = session || createFreshMockSession();
    const services: InvocationServices = { 
        memoryService: mockMemoryService,
        sessionService: { getSession: jest.fn(), createSession: jest.fn(), updateSessionState: jest.fn(), appendEvent: jest.fn(), listSessions: jest.fn(), deleteSession: jest.fn(), clearAllSessions: jest.fn() } as jest.Mocked<ISessionService>,
        artifactService: { saveArtifact: jest.fn(), getArtifact: jest.fn(), listArtifacts: jest.fn(), deleteArtifact: jest.fn(), clearAllArtifacts: jest.fn() } as jest.Mocked<IArtifactService>,
        llmRegistry: mockLlmRegistry, 
    };
    return {
        invocationId: 'inv-123',
        session: currentSession,
        runConfig: { 
            ...baseRunConfig, 
            ...(runConfigOverrides || {}),
        },
        agent,
        services: services, 
    };
};


describe('LlmAgent', () => {
    let agentOptions: LlmAgentProps;
    let agent: LlmAgent;
    let mockContext: InvocationContext;
    let freshMockFlow: MockFlowWithToolset;

    beforeEach(() => {
        jest.clearAllMocks();

        freshMockFlow = {
            name: 'freshMockFlowInstance',
            description: 'A fresh mock flow for testing',
            createInitialLlmRequest: jest.fn(),
            applyRequestProcessors: jest.fn(),
            applyResponseProcessors: jest.fn(),
            runLlmInteraction: jest.fn(), 
            getLlmInstance: jest.fn(),
            requestProcessors: [], 
            responseProcessors: [],
            toolset: undefined,
        };

        agentOptions = {
            name: 'TestLlmAgent',
            description: 'An LLM agent for testing',
            flow: freshMockFlow,
        };
        
        agent = new LlmAgent(agentOptions);
        mockContext = createMockInvocationContext(agent, createFreshMockSession());

        freshMockFlow.createInitialLlmRequest.mockReturnValue({ model: 'test-model', contents: [] } as LlmRequest);
        freshMockFlow.applyRequestProcessors.mockImplementation(async (req, _ctx) => req);
        freshMockFlow.applyResponseProcessors.mockImplementation(async (res, _req, _ctx) => res);
        freshMockFlow.runLlmInteraction.mockResolvedValue({
            eventId: 'flow-event-default', 
            type: EventType.LLM_RESPONSE, 
            source: {type: 'LLM', name: freshMockFlow.name },
            timestamp: new Date(), 
            interactionId: mockContext.invocationId, 
            sessionId: mockContext.session.id,
            userId: mockContext.session.userId,
            appName: mockContext.session.appName,
            data: { message: "Flow interaction successful" } 
        } as Event);
        freshMockFlow.getLlmInstance.mockResolvedValue(mockLlm);
    });

    it('should be an instance of LlmAgent and BaseAgent', () => {
        expect(agent).toBeInstanceOf(LlmAgent);
        expect(agent).toBeInstanceOf(BaseAgent);
    });

    describe('Constructor related tests', () => {
        it('should initialize with provided options', () => {
            const newAgent = new LlmAgent(agentOptions);
            expect(newAgent.name).toBe(agentOptions.name);
            expect(newAgent.description).toBe(agentOptions.description);
            expect((newAgent as any).flow).toBe(freshMockFlow);
        });
        it('should default to SingleFlow if no flow is provided', () => {
            const optsWithoutFlow: LlmAgentProps = { name: 'TestDefaultFlowAgent', description: 'Desc' };
            const agentWithDefaultFlow = new LlmAgent(optsWithoutFlow);
            expect((agentWithDefaultFlow as any).flow).toBeInstanceOf(SingleFlow);
            expect(((agentWithDefaultFlow as any).flow as IBaseLlmFlow).name).toBe('SingleFlow');
        });
    });

    describe('getInitialLlmRequest', () => {
        it('should use modelName from llmConfig if provided', () => {
            agent.llmConfig = { modelName: 'agent-specific-model' };
            const request = (agent as any).getInitialLlmRequest(mockContext);
            expect(request.model).toBe('agent-specific-model');
        });
    });

    async function collectEventsFromGenerator(generator: AsyncGenerator<Event, Event | void, undefined>): Promise<{yielded: Event[], returned: Event | void}> {
        const yielded: Event[] = [];
        let result = await generator.next();
        while(!result.done) {
            if(result.value) yielded.push(result.value);
            result = await generator.next();
        }
        return { yielded, returned: result.value };
    }

    describe('runLlmTurn', () => {
        it('should yield LLM_REQUEST then the flow event, and return the flow event on success', async () => {
            const expectedFlowEvent: Event = { 
                eventId: 'flow-success', type: EventType.LLM_RESPONSE, 
                source: {type:'LLM', name:freshMockFlow.name}, timestamp: new Date(), 
                interactionId:mockContext.invocationId, sessionId: mockContext.session.id, appName: mockContext.session.appName, userId: mockContext.session.userId,
            };
            freshMockFlow.runLlmInteraction.mockResolvedValue(expectedFlowEvent);

            const generator = (agent as any).runLlmTurn(mockContext);
            
            const result1 = await generator.next();
            expect(result1.done).toBe(false);
            expect(result1.value?.type).toBe(EventType.LLM_REQUEST);
            expect(result1.value?.llmRequest).toBeDefined();

            const result2 = await generator.next();
            expect(result2.done).toBe(false);
            expect(result2.value).toBe(expectedFlowEvent);
            
            const finalResult = await generator.next();
            expect(finalResult.done).toBe(true);
            expect(finalResult.value).toBe(expectedFlowEvent);
            
            expect(mockContext.session.events).toContain(result1.value);
            expect(mockContext.session.events).toContain(result2.value);
        });

        it('should yield error event if flow is not configured and return it', async () => {
            const agentWithoutFlow = new LlmAgent({name: 'NoFlowAgent', description: 'd'});
            (agentWithoutFlow as any).flow = undefined;
            const testContext = createMockInvocationContext(agentWithoutFlow, createFreshMockSession());

            const generator = (agentWithoutFlow as any).runLlmTurn(testContext);

            const errorEventResult = await generator.next();
            expect(errorEventResult.done).toBe(false);
            expect(errorEventResult.value?.type).toBe(EventType.ERROR);
            expect(errorEventResult.value?.data?.error?.message).toContain('does not have a flow configured');
            
            const finalResult = await generator.next();
            expect(finalResult.done).toBe(true);
            expect(finalResult.value).toBe(errorEventResult.value);
            expect(testContext.session.events).toContain(errorEventResult.value);
        });

        it('should handle agent transfer if flow event has transferToAgent action', async () => {
            const targetAgentName = 'TargetAgentX';
            const flowEventWithTransfer: Event = { 
                eventId: 'flow-transfer', type: EventType.MESSAGE, source: {type:'LLM', name:freshMockFlow.name}, 
                timestamp: new Date(), interactionId:mockContext.invocationId, sessionId: mockContext.session.id, 
                appName: mockContext.session.appName, userId: mockContext.session.userId,
                actions: { transferToAgent: targetAgentName } 
            };
            freshMockFlow.runLlmInteraction.mockResolvedValue(flowEventWithTransfer);
            
            const mockRootAgent = new LlmAgent({ name: 'Root', description: 'root', flow: freshMockFlow });
            const mockTargetAgent = new LlmAgent({ name: targetAgentName, description: 'target', flow: freshMockFlow });
            (mockRootAgent as any).subAgents = [agent, mockTargetAgent]; 
            agent.parentAgent = mockRootAgent; 

            const generator = (agent as any).runLlmTurn(mockContext);

            await generator.next(); 
            await generator.next(); 
            
            const transferEventResult = await generator.next();
            expect(transferEventResult.done).toBe(false);
            expect(transferEventResult.value?.type).toBe(EventType.AGENT_TRANSFER);
            expect(transferEventResult.value?.data?.transferInfo?.targetAgent).toBe(targetAgentName);

            const finalResult = await generator.next();
            expect(finalResult.done).toBe(true);
            expect(finalResult.value).toBe(transferEventResult.value);
            expect(mockContext.session.events).toContain(transferEventResult.value);
        });
    });

    describe('runAsync', () => {
        it('should yield INVOCATION_START, events from runLlmTurn, then INVOCATION_END, and return final event from flow', async () => {
            const flowEventFromTurn: Event = { 
                eventId: 'flow-runasync-success', type: EventType.LLM_RESPONSE, 
                source: {type:'LLM', name:freshMockFlow.name}, timestamp: new Date(), 
                interactionId:mockContext.invocationId, sessionId: mockContext.session.id, 
                appName: mockContext.session.appName, userId: mockContext.session.userId, 
                data: { text: 'RunAsync success from flow' } as any 
            };
            freshMockFlow.runLlmInteraction.mockResolvedValue(flowEventFromTurn);

            const { yielded, returned } = await collectEventsFromGenerator(agent.runAsync(mockContext));
            
            expect(yielded.length).toBe(4);
            expect(yielded[0].type).toBe(EventType.INVOCATION_START);
            expect(yielded[1].type).toBe(EventType.LLM_REQUEST);
            expect(yielded[2]).toBe(flowEventFromTurn);
            expect(yielded[3].type).toBe(EventType.INVOCATION_END);
            expect(returned).toBe(flowEventFromTurn);
        });

        it('should handle errors propagated from runLlmTurn (e.g. flow error)', async () => {
            const flowError = new Error('Flow interaction failed in runLlmTurn');
            freshMockFlow.runLlmInteraction.mockRejectedValue(flowError);

            const { yielded, returned } = await collectEventsFromGenerator(agent.runAsync(mockContext));
            
            const invocationStart = yielded.find(e => e.type === EventType.INVOCATION_START);
            const llmRequest = yielded.find(e => e.type === EventType.LLM_REQUEST);
            const errorEvent = yielded.find(e => e.type === EventType.ERROR);
            const invocationEnd = yielded.find(e => e.type === EventType.INVOCATION_END);

            expect(invocationStart).toBeDefined();
            expect(llmRequest).toBeDefined(); 
            expect(errorEvent).toBeDefined();
            expect(errorEvent?.data?.error?.message).toContain("Flow 'freshMockFlowInstance' failed");
            expect(invocationEnd).toBeDefined(); 
            expect(returned).toBe(errorEvent);
        });
        
        it('should execute beforeAgentCallback and afterAgentCallback', async () => {
            const beforeCb = jest.fn();
            const afterCb = jest.fn();
            agent.beforeAgentCallback = beforeCb;
            agent.afterAgentCallback = afterCb;

            await collectEventsFromGenerator(agent.runAsync(mockContext));

            expect(beforeCb).toHaveBeenCalledWith(expect.any(CallbackContext));
            expect(afterCb).toHaveBeenCalledWith(expect.any(CallbackContext));
        });

        it('afterAgentCallback can override the final event', async () => {
            const overrideEvent: Event = { 
                eventId: 'override-event', type: EventType.CUSTOM, source: {type:'SYSTEM', name:'cb'}, 
                timestamp: new Date(), interactionId:mockContext.invocationId, sessionId:mockContext.session.id, 
                appName: mockContext.session.appName, userId: mockContext.session.userId, 
                data: { custom: 'overridden' } as any 
            };
            const afterCb = jest.fn(async (cbCtx: CallbackContext) => {
                cbCtx.overrideEvent = overrideEvent;
            });
            agent.afterAgentCallback = afterCb as any;
            
            const { yielded, returned } = await collectEventsFromGenerator(agent.runAsync(mockContext));

            expect(yielded).toContain(overrideEvent);
            expect(returned).toBe(overrideEvent);
        });

        it('should yield INVOCATION_END and return it if runLlmTurn returns void and no override', async () => {
            const runLlmTurnSpy = jest.spyOn(agent as any, 'runLlmTurn').mockImplementation(async function*() {
                yield { 
                    eventId: 'dummy-llm-req', type: EventType.LLM_REQUEST, 
                    source:{type:'AGENT', name:agent.name}, timestamp: new Date(), 
                    interactionId:mockContext.invocationId, sessionId:mockContext.session.id,
                    appName: mockContext.session.appName, userId: mockContext.session.userId,
                 }; 
                return undefined; 
            });

            const { yielded, returned } = await collectEventsFromGenerator(agent.runAsync(mockContext));

            expect(yielded.find(e => e.type === EventType.INVOCATION_START)).toBeDefined();
            expect(yielded.find(e => e.type === EventType.LLM_REQUEST)).toBeDefined();
            const endEvent = yielded.find(e => e.type === EventType.INVOCATION_END);
            expect(endEvent).toBeDefined();
            expect(returned).toBe(endEvent);

            runLlmTurnSpy.mockRestore();
        });
    });
}); 