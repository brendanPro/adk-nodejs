import { Runner, AgentFactory } from '../Runner.js';
import { ISessionService } from '../services/ISessionService.js';
import { IArtifactService } from '../services/IArtifactService.js';
import { IMemoryService } from '../services/IMemoryService.js';
import { IAgent } from '../agents/IAgent.js';
import { InvocationContext } from '../common/InvocationContext.js';
import { RunConfig, RunOutput } from '../common/RunConfig.js';
import { Session, SessionState } from '../common/Session.js';
import { Event, EventType, EventSource, EventData } from '../common/Event.js';
import { Content, FunctionCall, Part, FunctionResponse as AdkFunctionResponse, AdkJsonSchemaType } from '../models/LlmContent.js';
import { ILlmRegistry } from '../llm/ILlmRegistry.js';
import { IBaseLlm, LlmRequest, LlmResponse, Candidate } from '../models/index.js';
import { LlmAgent, LlmAgentProps } from '../agents/LlmAgent.js';
import { SingleFlow } from '../flows/SingleFlow.js';
import { AutoFlow } from '../flows/AutoFlow.js';
import { BaseToolset } from '../tools/BaseToolset.js';
import { BaseTool } from '../tools/BaseTool.js';
import { ToolContext } from '../common/ToolContext.js';
import { v4 as uuidv4 } from 'uuid';

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

const mockArtifactService: IArtifactService = {
    saveArtifact: jest.fn(),
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

// Mock LLM
const mockLlmGenerateContentAsync = jest.fn();
const mockLlm: jest.Mocked<IBaseLlm> = {
    generateContentAsync: mockLlmGenerateContentAsync,
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

// Specialized Agent Tools (each agent has its own tools)
class CalculatorTool extends BaseTool {
    constructor() {
        super({
            name: 'calculator',
            description: 'Performs basic mathematical calculations',
            parametersSchema: {
                type: AdkJsonSchemaType.OBJECT,
                properties: {
                    operation: { type: AdkJsonSchemaType.STRING, enum: ['add', 'subtract', 'multiply', 'divide'] },
                    a: { type: AdkJsonSchemaType.NUMBER },
                    b: { type: AdkJsonSchemaType.NUMBER }
                },
                required: ['operation', 'a', 'b']
            }
        });
    }

    async execute(args: any, context: ToolContext): Promise<string> {
        const { operation, a, b } = args;
        let result: number;
        
        switch (operation) {
            case 'add':
                result = a + b;
                break;
            case 'subtract':
                result = a - b;
                break;
            case 'multiply':
                result = a * b;
                break;
            case 'divide':
                result = b !== 0 ? a / b : NaN;
                break;
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
        
        return `The result of ${a} ${operation} ${b} is ${result}`;
    }
}

class WeatherTool extends BaseTool {
    constructor() {
        super({
            name: 'get_weather',
            description: 'Gets weather information for a location',
            parametersSchema: {
                type: AdkJsonSchemaType.OBJECT,
                properties: {
                    location: { type: AdkJsonSchemaType.STRING }
                },
                required: ['location']
            }
        });
    }

    async execute(args: any, context: ToolContext): Promise<string> {
        const { location } = args;
        // Simulate weather API call
        const weather = {
            'New York': 'Sunny, 72°F',
            'London': 'Cloudy, 15°C',
            'Tokyo': 'Rainy, 18°C'
        };
        
        return weather[location as keyof typeof weather] || `Weather data not available for ${location}`;
    }
}

class TaskManagerTool extends BaseTool {
    private tasks: Array<{ id: string; title: string; completed: boolean }> = [];

    constructor() {
        super({
            name: 'manage_task',
            description: 'Manages tasks (create, list, complete)',
            parametersSchema: {
                type: AdkJsonSchemaType.OBJECT,
                properties: {
                    action: { type: AdkJsonSchemaType.STRING, enum: ['create', 'list', 'complete'] },
                    title: { type: AdkJsonSchemaType.STRING },
                    taskId: { type: AdkJsonSchemaType.STRING }
                },
                required: ['action']
            }
        });
    }

    async execute(args: any, context: ToolContext): Promise<string> {
        const { action, title, taskId } = args;
        
        switch (action) {
            case 'create':
                const newTask = { id: uuidv4(), title, completed: false };
                this.tasks.push(newTask);
                return `Task created: ${title} (ID: ${newTask.id})`;
                
            case 'list':
                if (this.tasks.length === 0) {
                    return 'No tasks found';
                }
                return this.tasks.map(t => `${t.id}: ${t.title} [${t.completed ? 'DONE' : 'PENDING'}]`).join('\n');
                
            case 'complete':
                const task = this.tasks.find(t => t.id === taskId);
                if (task) {
                    task.completed = true;
                    return `Task completed: ${task.title}`;
                }
                return `Task not found: ${taskId}`;
                
            default:
                return `Unknown action: ${action}`;
        }
    }
}

// Coordinator Tools (for orchestration, not domain-specific work)
class AgentDelegationTool extends BaseTool {
    constructor() {
        super({
            name: 'delegate_to_agent',
            description: 'Delegate a task to a specialized agent',
            parametersSchema: {
                type: AdkJsonSchemaType.OBJECT,
                properties: {
                    agent_name: { 
                        type: AdkJsonSchemaType.STRING,
                        enum: ['calculator_agent', 'weather_agent', 'task_agent']
                    },
                    task_description: { type: AdkJsonSchemaType.STRING },
                    reason: { type: AdkJsonSchemaType.STRING }
                },
                required: ['agent_name', 'task_description']
            }
        });
    }

    async execute(args: any, context: ToolContext): Promise<string> {
        const { agent_name, task_description, reason } = args;
        
        // Note: In a real implementation, this would signal agent transfer
        // For testing purposes, we just return the delegation message
        return `Delegating to ${agent_name}: ${task_description}${reason ? ` (Reason: ${reason})` : ''}`;
    }
}

// Helper function to create mock LLM responses
function createMockLlmResponse(text: string, functionCalls?: FunctionCall[]): LlmResponse {
    const parts: Part[] = [];
    
    if (text) {
        parts.push({ text });
    }
    
    if (functionCalls) {
        parts.push(...functionCalls.map(fc => ({ functionCall: fc })));
    }
    
    const candidate: Candidate = {
        content: { parts, role: 'model' },
        finishReason: 'STOP',
        index: 0,
        safetyRatings: []
    };
    
    return {
        model: 'mock-llm',
        candidates: [candidate]
    };
}

// Helper function to consume runner output
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

describe('Multi-Agent Integration Tests', () => {
    let runner: Runner;
    let coordinatorAgent: LlmAgent;
    let calculatorAgent: LlmAgent;
    let weatherAgent: LlmAgent;
    let taskAgent: LlmAgent;
    let agentFactory: AgentFactory;
    
    const defaultAppName = 'multi-agent-test-app';
    const defaultInteractionId = 'test-interaction-id';

    beforeEach(() => {
        jest.clearAllMocks();
        mockLlmGenerateContentAsync.mockReset();
        
        // Create specialized agents with their own tools
        const calculatorToolset = new BaseToolset({ name: 'CalculatorToolset' });
        calculatorToolset.addTool(new CalculatorTool());
        
        calculatorAgent = new LlmAgent({
            name: 'calculator_agent',
            description: 'Specialized agent for mathematical calculations',
            toolset: calculatorToolset,
            flow: new AutoFlow(undefined, calculatorToolset, mockLlmRegistry),
            llmConfig: { modelName: 'mock-llm' }
        });

        const weatherToolset = new BaseToolset({ name: 'WeatherToolset' });
        weatherToolset.addTool(new WeatherTool());
        
        weatherAgent = new LlmAgent({
            name: 'weather_agent',
            description: 'Specialized agent for weather information',
            toolset: weatherToolset,
            flow: new AutoFlow(undefined, weatherToolset, mockLlmRegistry),
            llmConfig: { modelName: 'mock-llm' }
        });

        const taskToolset = new BaseToolset({ name: 'TaskToolset' });
        taskToolset.addTool(new TaskManagerTool());
        
        taskAgent = new LlmAgent({
            name: 'task_agent',
            description: 'Specialized agent for task management',
            toolset: taskToolset,
            flow: new AutoFlow(undefined, taskToolset, mockLlmRegistry),
            llmConfig: { modelName: 'mock-llm' }
        });

        // Create coordinator agent with only orchestration tools
        const coordinatorToolset = new BaseToolset({ name: 'CoordinatorToolset' });
        coordinatorToolset.addTool(new AgentDelegationTool());

        coordinatorAgent = new LlmAgent({
            name: 'coordinator',
            description: 'Coordinates and delegates tasks to specialized agents',
            subAgents: [calculatorAgent, weatherAgent, taskAgent],
            toolset: coordinatorToolset, // Only has delegation tools
            flow: new AutoFlow(undefined, coordinatorToolset, mockLlmRegistry),
            llmConfig: { modelName: 'mock-llm' }
        });

        // Set up agent hierarchy
        calculatorAgent.parentAgent = coordinatorAgent;
        weatherAgent.parentAgent = coordinatorAgent;
        taskAgent.parentAgent = coordinatorAgent;

        // Create agent factory
        agentFactory = async (agentName: string, runConfig: RunConfig, invocationContext: InvocationContext): Promise<IAgent | undefined> => {
            switch (agentName) {
                case 'coordinator':
                    return coordinatorAgent;
                case 'calculator_agent':
                    return calculatorAgent;
                case 'weather_agent':
                    return weatherAgent;
                case 'task_agent':
                    return taskAgent;
                default:
                    return undefined;
            }
        };

        runner = new Runner(
            mockSessionService,
            mockArtifactService,
            mockMemoryService,
            agentFactory,
            mockLlmRegistry,
            undefined,
            defaultAppName
        );
    });

    const createMinimalRunConfig = (agentName: string, input: string | Content): RunConfig => ({
        agentName,
        input,
        userId: 'test-user',
        defaultModelName: 'mock-llm',
        interactionId: defaultInteractionId,
    });

    test('should demonstrate proper agent delegation pattern', async () => {
        const sessionId = 'delegation-session';
        const session: Session = {
            id: sessionId,
            userId: 'test-user',
            appName: defaultAppName,
            events: [],
            state: new SessionState(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        mockCreateSession.mockResolvedValue(session);
        mockGetSession.mockResolvedValue(null);
        mockAppendEvent.mockImplementation((sid, event) => {
            session.events.push(event);
            return Promise.resolve(session);
        });

        // Mock coordinator response: delegate to calculator agent
        mockLlmGenerateContentAsync
            .mockResolvedValueOnce(createMockLlmResponse('I need to delegate this calculation task.', [
                { 
                    name: 'delegate_to_agent', 
                    args: { 
                        agent_name: 'calculator_agent', 
                        task_description: 'Calculate 15 + 25',
                        reason: 'Mathematical calculation required'
                    } 
                }
            ]))
            // Mock second LLM call after tool execution (AutoFlow continues)
            .mockResolvedValueOnce(createMockLlmResponse('I have delegated the task to the calculator agent as requested.'));

        const runConfig = createMinimalRunConfig('coordinator', 'What is 15 + 25?');
        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));



        // Verify delegation flow
        expect(finalOutput.error).toBeUndefined();
        expect(yieldedEvents.some(e => e.type === EventType.LLM_REQUEST)).toBe(true);
        expect(yieldedEvents.some(e => e.type === EventType.TOOL_RESPONSE)).toBe(true);
        
        // Check that delegation tool was called (AutoFlow makes 2 LLM calls: 1st for tool call, 2nd after tool)
        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(2);
        
        // Verify the delegation tool response
        const toolResponse = yieldedEvents.find(e => e.type === EventType.TOOL_RESPONSE);
        const toolResponseText = toolResponse?.data?.content?.parts?.[0]?.functionResponse?.response?.parts?.[0]?.text;
        expect(toolResponseText).toContain('Delegating to calculator_agent');
        expect(toolResponseText).toContain('Calculate 15 + 25');
    });

    test('should handle direct agent execution with proper tools', async () => {
        const sessionId = 'direct-calc-session';
        const session: Session = {
            id: sessionId,
            userId: 'test-user',
            appName: defaultAppName,
            events: [],
            state: new SessionState(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        mockCreateSession.mockResolvedValue(session);
        mockGetSession.mockResolvedValue(null);
        mockAppendEvent.mockImplementation((sid, event) => {
            session.events.push(event);
            return Promise.resolve(session);
        });

        // Mock calculator agent response: use its calculator tool
        mockLlmGenerateContentAsync
            .mockResolvedValueOnce(createMockLlmResponse('I need to calculate this.', [
                { name: 'calculator', args: { operation: 'add', a: 15, b: 25 } }
            ]))
            .mockResolvedValueOnce(createMockLlmResponse('The calculation result is 40.'));

        const runConfig = createMinimalRunConfig('calculator_agent', 'Calculate 15 + 25');
        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        // Verify the specialized agent worked
        expect(finalOutput.error).toBeUndefined();
        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(2);
        
        // Check that the calculator tool was used
        const toolResponse = yieldedEvents.find(e => e.type === EventType.TOOL_RESPONSE);
        const toolResponseText = toolResponse?.data?.content?.parts?.[0]?.functionResponse?.response?.parts?.[0]?.text;
        expect(toolResponseText).toContain('The result of 15 add 25 is 40');
    });

    test('should handle weather agent with its specialized tools', async () => {
        const sessionId = 'weather-session';
        const session: Session = {
            id: sessionId,
            userId: 'test-user',
            appName: defaultAppName,
            events: [],
            state: new SessionState(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        mockCreateSession.mockResolvedValue(session);
        mockGetSession.mockResolvedValue(null);
        mockAppendEvent.mockImplementation((sid, event) => {
            session.events.push(event);
            return Promise.resolve(session);
        });

        // Mock weather agent response
        mockLlmGenerateContentAsync
            .mockResolvedValueOnce(createMockLlmResponse('Let me check the weather for you.', [
                { name: 'get_weather', args: { location: 'New York' } }
            ]))
            .mockResolvedValueOnce(createMockLlmResponse('The weather in New York is sunny, 72°F.'));

        const runConfig = createMinimalRunConfig('weather_agent', 'What\'s the weather in New York?');
        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        // Verify the weather agent worked
        expect(finalOutput.error).toBeUndefined();
        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(2);
        
        // Check that the weather tool was used
        const toolResponse = yieldedEvents.find(e => e.type === EventType.TOOL_RESPONSE);
        const toolResponseText = toolResponse?.data?.content?.parts?.[0]?.functionResponse?.response?.parts?.[0]?.text;
        expect(toolResponseText).toContain('Sunny, 72°F');
    });

    test('should handle task agent with task management tools', async () => {
        const sessionId = 'task-session';
        const session: Session = {
            id: sessionId,
            userId: 'test-user',
            appName: defaultAppName,
            events: [],
            state: new SessionState(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        mockCreateSession.mockResolvedValue(session);
        mockGetSession.mockResolvedValue(null);
        mockAppendEvent.mockImplementation((sid, event) => {
            session.events.push(event);
            return Promise.resolve(session);
        });

        // Mock task agent responses
        mockLlmGenerateContentAsync
            .mockResolvedValueOnce(createMockLlmResponse('I will create the task for you.', [
                { name: 'manage_task', args: { action: 'create', title: 'Test Task' } }
            ]))
            .mockResolvedValueOnce(createMockLlmResponse('Now let me list all tasks.', [
                { name: 'manage_task', args: { action: 'list' } }
            ]))
            .mockResolvedValueOnce(createMockLlmResponse('I\'ve created the task and listed all tasks.'));

        const runConfig = createMinimalRunConfig('task_agent', 'Create a task called "Test Task" and then list all tasks');
        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        // Verify the task agent worked
        expect(finalOutput.error).toBeUndefined();
        expect(mockLlmGenerateContentAsync).toHaveBeenCalledTimes(3);
        
        // Check that both task operations were performed
        const toolResponses = yieldedEvents.filter(e => e.type === EventType.TOOL_RESPONSE);
        expect(toolResponses).toHaveLength(2);
        
        // Verify task creation
        const createResponse = toolResponses[0].data?.content?.parts?.[0]?.functionResponse?.response?.parts?.[0]?.text;
        expect(createResponse).toContain('Task created: Test Task');
        
        // Verify task listing
        const listResponse = toolResponses[1].data?.content?.parts?.[0]?.functionResponse?.response?.parts?.[0]?.text;
        expect(listResponse).toContain('Test Task');
    });

    test('should demonstrate why coordinator delegation is better than direct tool access', async () => {
        // This test shows the architectural benefits:
        // 1. Coordinator only knows about delegation, not domain specifics
        // 2. Specialized agents handle their own domain tools
        // 3. Clean separation of concerns
        // 4. Easier to add new agents without changing coordinator
        
        const sessionId = 'architecture-demo-session';
        const session: Session = {
            id: sessionId,
            userId: 'test-user',
            appName: defaultAppName,
            events: [],
            state: new SessionState(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        mockCreateSession.mockResolvedValue(session);
        mockGetSession.mockResolvedValue(null);
        mockAppendEvent.mockImplementation((sid, event) => {
            session.events.push(event);
            return Promise.resolve(session);
        });

        // Coordinator delegates to weather agent
        mockLlmGenerateContentAsync
            .mockResolvedValueOnce(createMockLlmResponse('I should delegate this weather query.', [
                { 
                    name: 'delegate_to_agent', 
                    args: { 
                        agent_name: 'weather_agent', 
                        task_description: 'Get weather for London',
                        reason: 'Weather information required'
                    } 
                }
            ]))
            // Mock second LLM call after tool execution
            .mockResolvedValueOnce(createMockLlmResponse('I have delegated the weather query to the weather agent.'));

        const runConfig = createMinimalRunConfig('coordinator', 'What\'s the weather like in London?');
        const { yieldedEvents, finalOutput } = await consumeRunnerOutput(runner.runAgent(runConfig));

        // Verify coordinator behavior
        expect(finalOutput.error).toBeUndefined();
        
        // Coordinator should only use delegation tools, not weather tools
        const toolResponse = yieldedEvents.find(e => e.type === EventType.TOOL_RESPONSE);
        const functionResponseName = toolResponse?.data?.content?.parts?.[0]?.functionResponse?.name;
        
        // Should be the delegation tool, not a weather tool
        expect(functionResponseName).toBe('delegate_to_agent');
        
        // The response should indicate delegation
        const responseText = toolResponse?.data?.content?.parts?.[0]?.functionResponse?.response?.parts?.[0]?.text;
        expect(responseText).toContain('Delegating to weather_agent');
        expect(responseText).toContain('Get weather for London');
    });
}); 