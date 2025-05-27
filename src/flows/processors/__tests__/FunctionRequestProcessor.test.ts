import { FunctionRequestProcessor } from '../FunctionRequestProcessor.js';
import { LlmRequest } from '../../../models/LlmRequest.js';
import { InvocationContext } from '../../../common/InvocationContext.js';
import { IToolset } from '../../../tools/IToolset.js';
import { FunctionDeclaration, Tool as AdkTool, AdkJsonSchemaType } from '../../../models/LlmContent.js'; // ADK's Tool type
import { BaseAgent } from '../../../agents/BaseAgent.js'; // For agent context
import { Session, SessionState } from '../../../common/Session.js';
import { RunConfig } from '../../../common/RunConfig.js';
import { IAgent } from '../../../agents/IAgent.js';
import { Event, EventType, EventSource } from '../../../common/Event.js'; // Added EventType, EventSource
import { IBaseLlmFlow } from '../../../flows/IBaseLlmFlow.js'; // For MockTestAgent
import { Content } from '../../../models/LlmContent.js'; // Added Content for runAsync

// Mocks
const mockToolset: jest.Mocked<IToolset> = {
  name: 'mock-toolset', // Optional name property
  getFunctionDeclarations: jest.fn(),
  executeTool: jest.fn(),
  getTool: jest.fn(),
  getTools: jest.fn(),
  addTool: jest.fn(), // Added missing mock
  removeTool: jest.fn(), // Added missing mock
};

// Minimal concrete class for BaseAgent instantiation in tests
class MockTestAgent extends BaseAgent {
  // Implementing abstract members from BaseAgent
  protected flow?: IBaseLlmFlow = undefined; // Can be undefined as it's optional in BaseAgent
  
  constructor(props: { name: string; description: string; toolset?: IToolset }) {
    super(props);
  }

  protected getInitialLlmRequest(context: InvocationContext): LlmRequest {
    return {
      model: 'mock-test-agent-model',
      contents: [],
      requestId: context.invocationId,
    };
  }
  
  // Updated to match IAgent.runAsync signature
  async *runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined> {
    // console.log(`MockTestAgent ${this.name} runAsync called`); // No console.log
    const mockEvent: Event = {
        eventId: `mock-event-${this.name}-${Date.now()}`,
        type: EventType.MESSAGE,
        source: { type: 'AGENT', name: this.name } as EventSource,
        timestamp: new Date(),
        interactionId: context.invocationId,
        sessionId: context.session.id,
        appName: context.session.appName,
        userId: context.session.userId,
        data: { message: `MockTestAgent ${this.name} executed.` }
    };
    if (context.session && context.session.events) {
        context.session.events.push(mockEvent);
    }
    yield mockEvent;
    return mockEvent; // Return the event as the final outcome
  }
}

const mockAgentWithToolset = new MockTestAgent({
    name: 'testAgentWithToolset',
    description: 'description',
    toolset: mockToolset,
});

const mockAgentWithoutToolset = new MockTestAgent({
    name: 'testAgentWithoutToolset',
    description: 'description',
});

describe('FunctionRequestProcessor', () => {
  let processor: FunctionRequestProcessor;
  let baseRequest: LlmRequest;
  let mockContext: InvocationContext;
  let mockSession: Session;
  // let mockRunConfig: RunConfig; // Commented out, will define directly in mockContext

  beforeEach(() => {
    mockToolset.getFunctionDeclarations.mockReset();
    mockToolset.addTool.mockReset();
    mockToolset.removeTool.mockReset();
    // Reset other IToolset mocks if they were to be used by other tests for this processor
    mockToolset.executeTool.mockReset();
    mockToolset.getTool.mockReset();
    mockToolset.getTools.mockReset();

    baseRequest = {
      model: 'test-model',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };

    mockSession = {
        id: 'session-123',
        userId: 'user-abc',
        appName: 'test-app',
        events: [],
        state: new SessionState(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

    // mockRunConfig = { defaultModelName: 'test-model', traceEnabled: false }; // This line is problematic
    
    // Define mockContext with a complete RunConfig here
    // Need an instance of mockAgentWithoutToolset to get its name for agentName
    const defaultAgentForContext = new MockTestAgent({ name: 'defaultCtxAgent', description: 'desc'});
    mockContext = { 
        invocationId: 'inv-for-req-proc',
        session: mockSession,
        runConfig: { 
            agentName: defaultAgentForContext.name, 
            input: { parts: [{ text: 'default func req proc input'}] },
            defaultModelName: 'test-model',
            // traceEnabled: false // traceEnabled is not a property of RunConfig
        },
        agent: defaultAgentForContext, 
      };
  });

  describe('processRequest', () => {
    it('should not modify the request if no toolset is available anywhere', async () => {
      processor = new FunctionRequestProcessor();
      // mockContext is already set up in beforeEach with an agent without toolset by default
      // if mockContext.agent is mockAgentWithoutToolset, this test should work.
      // For clarity, ensure it for this specific test if needed or rely on beforeEach setup.
      mockContext.agent = new MockTestAgent({ name: 'testAgentNoToolsetForThisTest', description: 'desc'});
      mockContext.runConfig.agentName = mockContext.agent.name; // Keep runConfig consistent

      const originalRequest = { ...baseRequest };
      const processedRequest = await processor.processRequest(originalRequest, mockContext) as LlmRequest;
      
      expect(processedRequest).toEqual(originalRequest);
      expect(processedRequest.tools).toBeUndefined();
      expect(processedRequest.toolConfig).toBeUndefined();
      expect(mockToolset.getFunctionDeclarations).not.toHaveBeenCalled();
    });

    it('should add tools and toolConfig using toolset from constructor', async () => {
      const funcDecl1: FunctionDeclaration = { 
        name: 'tool1', 
        description: 'Tool 1', 
        parameters: { type: AdkJsonSchemaType.OBJECT, properties: { p1: { type: AdkJsonSchemaType.STRING }}} 
      };
      mockToolset.getFunctionDeclarations.mockResolvedValue([funcDecl1]);
      processor = new FunctionRequestProcessor(mockToolset);
      
      mockContext = { 
        invocationId: 'inv-1',
        session: mockSession,
        runConfig: { 
            agentName: (mockAgentWithoutToolset as IAgent).name, 
            input: { parts: [{text: 'test ctor'}]},
            defaultModelName: 'model-ctor'
        },
        agent: mockAgentWithoutToolset as IAgent,
      };

      const processedRequest = await processor.processRequest(baseRequest, mockContext) as LlmRequest;

      expect(mockToolset.getFunctionDeclarations).toHaveBeenCalledWith(undefined);
      expect(processedRequest.tools).toBeDefined();
      expect(processedRequest.tools).toHaveLength(1);
      expect(processedRequest.tools![0].functionDeclarations).toEqual([funcDecl1]);
      expect(processedRequest.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    });

    it('should add tools and toolConfig using toolset from agent context if constructor has no toolset', async () => {
      const funcDeclAgent: FunctionDeclaration = { 
        name: 'agentTool1', 
        description: 'Agent Tool 1', 
        parameters: { type: AdkJsonSchemaType.OBJECT, properties: {หน่วย: { type: AdkJsonSchemaType.STRING } } } // Example with non-ascii
      };
      (mockAgentWithToolset.toolset as jest.Mocked<IToolset>).getFunctionDeclarations.mockResolvedValue([funcDeclAgent]);
      
      processor = new FunctionRequestProcessor(); // No toolset in constructor
      
      mockContext = { 
        invocationId: 'inv-1',
        session: mockSession,
        runConfig: { 
            agentName: (mockAgentWithToolset as IAgent).name, 
            input: { parts: [{text: 'test agent'}]},
            defaultModelName: 'model-agent'
        },
        agent: mockAgentWithToolset as IAgent,
      };

      const processedRequest = await processor.processRequest(baseRequest, mockContext) as LlmRequest;

      // Verify that the agent's toolset was accessed
      expect((mockAgentWithToolset.toolset as jest.Mocked<IToolset>).getFunctionDeclarations).toHaveBeenCalledWith(undefined);
      
      expect(processedRequest.tools).toBeDefined();
      expect(processedRequest.tools).toHaveLength(1);
      expect(processedRequest.tools![0].functionDeclarations).toEqual([funcDeclAgent]);
      expect(processedRequest.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    });

    it('should prioritize constructor-provided toolset over agent.toolset', async () => {
      const funcDeclConstructor: FunctionDeclaration = { 
        name: 'constructorTool', 
        description: 'Constructor Tool', 
        parameters: { type: AdkJsonSchemaType.OBJECT, properties: {} } 
      };
      const constructorToolset: jest.Mocked<IToolset> = {
        ...mockToolset, // Spread common mocks, override getFunctionDeclarations
        getFunctionDeclarations: jest.fn().mockResolvedValue([funcDeclConstructor]),
      };

      const funcDeclAgentContext: FunctionDeclaration = { name: 'agentContextTool', description: 'Agent Context Tool' }; // No params for simplicity here
      const agentContextToolset: jest.Mocked<IToolset> = {
        ...mockToolset,
        getFunctionDeclarations: jest.fn().mockResolvedValue([funcDeclAgentContext]),
      };

      processor = new FunctionRequestProcessor(constructorToolset);
      
      const agentWithDifferentToolset = new MockTestAgent({
        name: 'agentWithDifferentToolset',
        description: 'description',
        toolset: agentContextToolset,
      });
      mockContext = { 
        invocationId: 'inv-1',
        session: mockSession,
        runConfig: { 
            agentName: agentWithDifferentToolset.name, 
            input: { parts: [{text: 'test prio'}]},
            defaultModelName: 'model-prio'
        },
        agent: agentWithDifferentToolset as IAgent,
      };

      const processedRequest = await processor.processRequest(baseRequest, mockContext) as LlmRequest;

      expect(constructorToolset.getFunctionDeclarations).toHaveBeenCalledWith(undefined);
      expect(agentContextToolset.getFunctionDeclarations).not.toHaveBeenCalled();
      expect(processedRequest.tools).toBeDefined();
      expect(processedRequest.tools![0].functionDeclarations).toEqual([funcDeclConstructor]);
    });

    it('should return request unmodified if toolset provides no function declarations', async () => {
      mockToolset.getFunctionDeclarations.mockResolvedValue([]); // Empty array
      processor = new FunctionRequestProcessor(mockToolset);
      mockContext = { 
        invocationId: 'inv-1',
        session: mockSession,
        runConfig: { 
            agentName: (mockAgentWithoutToolset as IAgent).name, 
            input: { parts: [{text: 'test no decl'}]},
            defaultModelName: 'model-no-decl'
        },
        agent: mockAgentWithoutToolset as IAgent,
      };
      const originalRequest = { ...baseRequest }; // shallow copy

      const processedRequest = await processor.processRequest(baseRequest, mockContext) as LlmRequest;

      expect(mockToolset.getFunctionDeclarations).toHaveBeenCalledWith(undefined);
      expect(processedRequest.tools).toBeUndefined(); // As per current implementation for empty decls
      expect(processedRequest.toolConfig).toBeUndefined(); // As per current implementation
      expect(processedRequest).toEqual(originalRequest);
    });

    it('should add its tool to an existing request.tools array', async () => {
      const existingToolDecl: FunctionDeclaration = { name: 'existingTool', description: 'Existing Tool' };
      const existingAdkTool: AdkTool = { functionDeclarations: [existingToolDecl] }; 
      const requestWithExistingTools: LlmRequest = {
        ...baseRequest,
        tools: [existingAdkTool],
      };

      const newToolDecl: FunctionDeclaration = { 
        name: 'newTool', 
        description: 'New Tool', 
        parameters: { type: AdkJsonSchemaType.OBJECT, properties: {propNew: {type: AdkJsonSchemaType.BOOLEAN}} } 
      };
      mockToolset.getFunctionDeclarations.mockResolvedValue([newToolDecl]);
      processor = new FunctionRequestProcessor(mockToolset);
      mockContext = { 
        invocationId: 'inv-1',
        session: mockSession,
        runConfig: { 
            agentName: (mockAgentWithoutToolset as IAgent).name, 
            input: { parts: [{text: 'test existing'}]},
            defaultModelName: 'model-existing'
        },
        agent: mockAgentWithoutToolset as IAgent,
      };

      const processedRequest = await processor.processRequest(requestWithExistingTools, mockContext) as LlmRequest;

      expect(processedRequest.tools).toBeDefined();
      expect(processedRequest.tools).toHaveLength(2);
      expect(processedRequest.tools).toContainEqual(existingAdkTool); // Check if existing tool is still there
      expect(processedRequest.tools).toContainEqual({ functionDeclarations: [newToolDecl] }); // Check if new tool is added
    });

    describe('toolConfig handling', () => {
      const newToolDecl: FunctionDeclaration = { 
        name: 'someTool', 
        description: 'Some Tool', 
        parameters: { type: AdkJsonSchemaType.OBJECT, properties: {} } 
      };
      beforeEach(() => {
        mockToolset.getFunctionDeclarations.mockResolvedValue([newToolDecl]);
        processor = new FunctionRequestProcessor(mockToolset);
        mockContext = { 
          invocationId: 'inv-1',
          session: mockSession,
          runConfig: { 
            agentName: (mockAgentWithoutToolset as IAgent).name, 
            input: { parts: [{text: 'test merge'}]},
            defaultModelName: 'model-merge'
          },
          agent: mockAgentWithoutToolset as IAgent,
        };
      });

      it('should add default toolConfig if request.toolConfig is undefined', async () => {
        const requestWithoutConfig = { ...baseRequest };
        const processedRequest = await processor.processRequest(requestWithoutConfig, mockContext) as LlmRequest;
        expect(processedRequest.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
      });

      it('should add default functionCallingConfig if request.toolConfig exists but functionCallingConfig is undefined', async () => {
        const requestPartialConfig: LlmRequest = {
          ...baseRequest,
          toolConfig: {}, // toolConfig exists, but no functionCallingConfig
        };
        const processedRequest = await processor.processRequest(requestPartialConfig, mockContext) as LlmRequest;
        expect(processedRequest.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
      });

      it('should NOT override existing functionCallingConfig.mode', async () => {
        const requestWithSpecificMode: LlmRequest = {
          ...baseRequest,
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        };
        const processedRequest = await processor.processRequest(requestWithSpecificMode, mockContext) as LlmRequest;
        expect(processedRequest.toolConfig?.functionCallingConfig?.mode).toEqual('AUTO');
      });

      it('should still add its tools even if toolConfig handling doesnt change mode', async () => {
        const requestWithSpecificMode: LlmRequest = {
          ...baseRequest,
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        };
        const processedRequest = await processor.processRequest(requestWithSpecificMode, mockContext) as LlmRequest;
        expect(processedRequest.tools).toBeDefined();
        expect(processedRequest.tools![0].functionDeclarations).toEqual([newToolDecl]);
      });
    });
  });
}); 