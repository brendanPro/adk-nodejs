import { BaseToolset } from '../BaseToolset.js';
import { ITool } from '../ITool.js';
import { ToolContext } from '../../common/ToolContext.js';
import { FunctionDeclaration, Content, AdkJsonSchema, AdkJsonSchemaType } from '../../models/LlmContent.js';
import { Event, EventType, EventSource } from '../../common/Event.js';
import { InvocationContext } from '../../common/InvocationContext.js'; // For creating ToolContext
import { Session, SessionState } from '../../common/Session.js';
import { RunConfig } from '../../common/RunConfig.js';
import { BaseAgent } from '../../agents/BaseAgent.js'; // For InvocationContext -> ToolContext
import { LlmRequest } from '../../models/LlmRequest.js'; // For BaseAgent mock
import { IBaseLlmFlow } from '../../flows/IBaseLlmFlow.js'; // For BaseAgent mock

// Minimal concrete class for BaseAgent used in InvocationContext for ToolContext creation
class MockAgentForContext extends BaseAgent {
  protected flow?: IBaseLlmFlow = undefined;
  constructor(name: string = 'mockAgent') {
    super({ name, description: 'mock agent desc' });
  }
  protected getInitialLlmRequest(context: InvocationContext): LlmRequest {
    return { model: 'mock-model', contents: [] };
  }
  async *runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined> {
    const mockEvent: Event = {
        eventId: `mock-event-${this.name}-${Date.now()}`,
        type: EventType.MESSAGE,
        source: { type: 'AGENT', name: this.name } as EventSource,
        timestamp: new Date(),
        interactionId: context.invocationId,
        sessionId: context.session.id,
        appName: context.session.appName,
        userId: context.session.userId,
        data: { message: `Mock agent ${this.name} executed.` }
    };
    if (context.session && context.session.events) {
        context.session.events.push(mockEvent);
    }
    yield mockEvent;
    return mockEvent;
  }
}

// Mock ITool implementation
const createMockTool = (name: string): jest.Mocked<ITool> => ({
  name,
  description: `${name} description`,
  parametersSchema: { type: AdkJsonSchemaType.OBJECT, properties: {} } as AdkJsonSchema,
  asFunctionDeclaration: jest.fn().mockResolvedValue({
    name,
    description: `${name} description for LLM`,
    parameters: { type: AdkJsonSchemaType.OBJECT, properties: {} } as AdkJsonSchema,
  }),
  execute: jest.fn().mockResolvedValue({ parts: [{ text: `${name} execution result` }] }),
  beforeExecution: jest.fn(),
  afterExecution: jest.fn(),
  // onError: jest.fn(), // If we decide to add onError
});

let mockToolContext: ToolContext;
const testAgentForBaseInvocation = new MockAgentForContext('testAgentForToolContext');

const baseInvocationContext: InvocationContext = {
    invocationId: 'inv-ctx-123',
    session: {
        id: 'sess-123',
        userId: 'user-1',
        appName: 'test-app',
        events: [],
        state: new SessionState(),
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    runConfig: { 
        agentName: testAgentForBaseInvocation.name, 
        input: { parts: [{ text: 'default base toolset input' }] }, 
        defaultModelName: 'test-model', 
        // traceEnabled: false // Not a property of RunConfig
    },
    agent: testAgentForBaseInvocation,
};

// Helper to create a basic ToolContext for tests
const createTestToolContext = (invocationCtx: InvocationContext = baseInvocationContext): ToolContext => ({
    invocationId: invocationCtx.invocationId,
    functionCallId: 'fc-123', // Example function call ID
    agentName: invocationCtx.agent.name,
    sessionState: invocationCtx.session.state,
    invocationContext: invocationCtx,
    actions: {},
});

describe('BaseToolset', () => {
  let toolset: BaseToolset;
  let mockTool1: jest.Mocked<ITool>;
  let mockTool2: jest.Mocked<ITool>;

  beforeEach(() => {
    toolset = new BaseToolset({ name: 'testToolset' });
    mockTool1 = createMockTool('tool1');
    mockTool2 = createMockTool('tool2');
    mockToolContext = createTestToolContext(); // Initialize a default mockToolContext
  });

  describe('Constructor', () => {
    it('should initialize with a name', () => {
      expect(toolset.name).toBe('testToolset');
    });

    it('should initialize with an empty map of tools if no tools are provided', () => {
      expect(toolset.getTools()).toEqual([]);
    });

    it('should initialize with tools if provided in constructor', () => {
      const initialTools = [mockTool1, mockTool2];
      const tsWithTools = new BaseToolset({ name: 'prefilled', tools: initialTools });
      expect(tsWithTools.getTools()).toHaveLength(2);
      expect(tsWithTools.getTool('tool1')).toBe(mockTool1);
      expect(tsWithTools.getTool('tool2')).toBe(mockTool2);
    });
  });

  describe('addTool', () => {
    it('should add a tool to the toolset', () => {
      toolset.addTool(mockTool1);
      expect(toolset.getTool('tool1')).toBe(mockTool1);
      expect(toolset.getTools()).toHaveLength(1);
    });

    it('should throw an error if adding a tool with a duplicate name', () => {
      toolset.addTool(mockTool1);
      expect(() => toolset.addTool({ ...mockTool1, description: 'duplicate' })).toThrow(
        "Toolset 'testToolset': Tool with name 'tool1' already exists."
      );
    });
  });

  describe('getTool', () => {
    it('should return the tool if it exists', () => {
      toolset.addTool(mockTool1);
      expect(toolset.getTool('tool1')).toBe(mockTool1);
    });

    it('should return undefined if the tool does not exist', () => {
      expect(toolset.getTool('nonExistentTool')).toBeUndefined();
    });
  });

  describe('removeTool', () => {
    it('should remove the tool if it exists and return true', () => {
      toolset.addTool(mockTool1);
      expect(toolset.removeTool('tool1')).toBe(true);
      expect(toolset.getTool('tool1')).toBeUndefined();
    });

    it('should return false if the tool does not exist', () => {
      expect(toolset.removeTool('nonExistentTool')).toBe(false);
    });
  });

  describe('getTools', () => {
    it('should return an array of all tools in the toolset', () => {
      toolset.addTool(mockTool1);
      toolset.addTool(mockTool2);
      const tools = toolset.getTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(mockTool1);
      expect(tools).toContain(mockTool2);
    });
  });

  describe('getFunctionDeclarations', () => {
    it('should return an array of function declarations from all tools', async () => {
      toolset.addTool(mockTool1);
      toolset.addTool(mockTool2);

      const decl1: FunctionDeclaration = { name: 'tool1', description: 'desc1', parameters: {type: AdkJsonSchemaType.OBJECT, properties: { p1: {type: AdkJsonSchemaType.STRING}}} };
      const decl2: FunctionDeclaration = { name: 'tool2', description: 'desc2', parameters: {type: AdkJsonSchemaType.OBJECT, properties: { p2: {type: AdkJsonSchemaType.NUMBER}}} };
      mockTool1.asFunctionDeclaration.mockResolvedValue(decl1);
      mockTool2.asFunctionDeclaration.mockResolvedValue(decl2);

      const declarations = await toolset.getFunctionDeclarations(mockToolContext);

      expect(declarations).toHaveLength(2);
      expect(declarations).toContainEqual(decl1);
      expect(declarations).toContainEqual(decl2);
      expect(mockTool1.asFunctionDeclaration).toHaveBeenCalledWith(mockToolContext);
      expect(mockTool2.asFunctionDeclaration).toHaveBeenCalledWith(mockToolContext);
    });

    it('should handle errors when a tool fails to provide a declaration and log to console', async () => {
      toolset.addTool(mockTool1);
      toolset.addTool(mockTool2);

      const decl1: FunctionDeclaration = { name: 'tool1', description: 'desc1' };
      mockTool1.asFunctionDeclaration.mockResolvedValue(decl1);
      const error = new Error('Failed to declare tool2');
      mockTool2.asFunctionDeclaration.mockRejectedValue(error);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const declarations = await toolset.getFunctionDeclarations(mockToolContext);

      expect(declarations).toHaveLength(1);
      expect(declarations).toContainEqual(decl1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Toolset 'testToolset': Error getting function declaration for tool 'tool2':`,
        error
      );
      consoleErrorSpy.mockRestore();
    });

    it('should return an empty array if the toolset has no tools', async () => {
      const declarations = await toolset.getFunctionDeclarations(mockToolContext);
      expect(declarations).toEqual([]);
    });

    it('should call asFunctionDeclaration on tools without context if no context is provided', async () => {
        toolset.addTool(mockTool1);
        const decl1: FunctionDeclaration = { name: 'tool1', description: 'desc1' };
        mockTool1.asFunctionDeclaration.mockResolvedValue(decl1);
  
        await toolset.getFunctionDeclarations(); // No context
  
        expect(mockTool1.asFunctionDeclaration).toHaveBeenCalledWith(undefined);
      });
  });

  describe('executeTool', () => {
    const mockArgs = { param1: 'value1' };
    const executeResult: Content = { parts: [{ text: 'tool1 execution result' }] };

    beforeEach(() => {
        mockTool1.execute.mockClear().mockResolvedValue(executeResult);
        // Ensure these are treated as Jest mocks for clearing and further specific mocking
        (mockTool1.beforeExecution as jest.Mock).mockClear().mockResolvedValue(undefined);
        (mockTool1.afterExecution as jest.Mock).mockClear().mockResolvedValue(undefined);
        
        mockTool2.execute.mockClear();
        (mockTool2.beforeExecution as jest.Mock).mockClear().mockResolvedValue(undefined);
        (mockTool2.afterExecution as jest.Mock).mockClear().mockResolvedValue(undefined);
    });

    it('should throw an error if the tool is not found', async () => {
      await expect(toolset.executeTool('nonExistentTool', mockArgs, mockToolContext)).rejects.toThrow(
        "Toolset 'testToolset': Tool 'nonExistentTool' not found."
      );
    });

    it('should execute the tool and return its result if no callbacks are effectively defined (or they complete successfully)', async () => {
      toolset.addTool(mockTool1);
      const result = await toolset.executeTool('tool1', mockArgs, mockToolContext);
      expect(mockTool1.execute).toHaveBeenCalledWith(mockArgs, mockToolContext);
      expect(result).toEqual(executeResult);
      // beforeExecution and afterExecution are jest.fn(), so they exist. Check they were called.
      expect(mockTool1.beforeExecution).toHaveBeenCalledWith(mockToolContext, mockArgs);
      expect(mockTool1.afterExecution).toHaveBeenCalledWith(mockToolContext, executeResult);
    });

    it('should call beforeExecution, execute, and afterExecution in order', async () => {
      toolset.addTool(mockTool1);
      const order: string[] = [];
      // Cast to jest.Mock to use mockImplementation
      (mockTool1.beforeExecution as jest.Mock).mockImplementation(async () => { order.push('before'); });
      mockTool1.execute.mockImplementation(async () => { order.push('execute'); return executeResult; });
      (mockTool1.afterExecution as jest.Mock).mockImplementation(async () => { order.push('after'); });

      await toolset.executeTool('tool1', mockArgs, mockToolContext);

      expect(order).toEqual(['before', 'execute', 'after']);
      expect(mockTool1.beforeExecution).toHaveBeenCalledWith(mockToolContext, mockArgs);
      expect(mockTool1.execute).toHaveBeenCalledWith(mockArgs, mockToolContext);
      expect(mockTool1.afterExecution).toHaveBeenCalledWith(mockToolContext, executeResult);
    });

    it('should throw error and not call execute or afterExecution if beforeExecution fails', async () => {
      toolset.addTool(mockTool1);
      const beforeError = new Error('Before-hook failed');
      (mockTool1.beforeExecution as jest.Mock).mockRejectedValue(beforeError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(toolset.executeTool('tool1', mockArgs, mockToolContext)).rejects.toThrow(beforeError);
      
      expect(mockTool1.execute).not.toHaveBeenCalled();
      expect(mockTool1.afterExecution).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Toolset 'testToolset': Error during lifecycle of tool 'tool1':`,
        beforeError
      );
      consoleErrorSpy.mockRestore();
    });

    it('should throw error and not call afterExecution if execute fails', async () => {
      toolset.addTool(mockTool1);
      const executeError = new Error('Execute failed');
      mockTool1.execute.mockRejectedValue(executeError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(toolset.executeTool('tool1', mockArgs, mockToolContext)).rejects.toThrow(executeError);

      expect(mockTool1.beforeExecution).toHaveBeenCalled();
      expect(mockTool1.afterExecution).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Toolset 'testToolset': Error during lifecycle of tool 'tool1':`,
        executeError
      );
      consoleErrorSpy.mockRestore();
    });

    it('should throw error if afterExecution fails', async () => {
      toolset.addTool(mockTool1);
      const afterError = new Error('After-hook failed');
      (mockTool1.afterExecution as jest.Mock).mockRejectedValue(afterError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(toolset.executeTool('tool1', mockArgs, mockToolContext)).rejects.toThrow(afterError);

      expect(mockTool1.beforeExecution).toHaveBeenCalled();
      expect(mockTool1.execute).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Toolset 'testToolset': Error during lifecycle of tool 'tool1':`,
        afterError
      );
      consoleErrorSpy.mockRestore();
    });

    it('should call an array of beforeExecution callbacks in order', async () => {
        toolset.addTool(mockTool1);
        const cb1 = jest.fn().mockResolvedValue(undefined);
        const cb2 = jest.fn().mockResolvedValue(undefined);
        mockTool1.beforeExecution = [cb1, cb2];
  
        await toolset.executeTool('tool1', mockArgs, mockToolContext);
  
        expect(cb1).toHaveBeenCalledWith(mockToolContext, mockArgs);
        expect(cb2).toHaveBeenCalledWith(mockToolContext, mockArgs);
    });

    it('should call an array of afterExecution callbacks in order', async () => {
        toolset.addTool(mockTool1);
        const cb1 = jest.fn().mockResolvedValue(undefined);
        const cb2 = jest.fn().mockResolvedValue(undefined);
        mockTool1.afterExecution = [cb1, cb2];
  
        await toolset.executeTool('tool1', mockArgs, mockToolContext);
  
        expect(cb1).toHaveBeenCalledWith(mockToolContext, executeResult);
        expect(cb2).toHaveBeenCalledWith(mockToolContext, executeResult);
    });

  });
}); 