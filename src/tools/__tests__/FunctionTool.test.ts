import { FunctionTool, FunctionToolProps, WrappedFunction } from '../FunctionTool.js';
import { BaseTool } from '../BaseTool.js'; // To check inheritance
import { ITool, ToolParametersSchema } from '../ITool.js';
import { ToolContext } from '../../common/ToolContext.js';
import { Content, FunctionDeclaration, AdkJsonSchema, AdkJsonSchemaType } from '../../models/LlmContent.js';
import { Event, EventType, EventSource } from '../../common/Event.js';
import { InvocationContext } from '../../common/InvocationContext.js';
import { Session, SessionState } from '../../common/Session.js';
import { RunConfig } from '../../common/RunConfig.js';
import { BaseAgent } from '../../agents/BaseAgent.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { IBaseLlmFlow } from '../../flows/IBaseLlmFlow.js';

// Minimal concrete class for BaseAgent used in InvocationContext for ToolContext creation
class MockAgentForToolContext extends BaseAgent {
  protected flow?: IBaseLlmFlow = undefined;
  constructor(name: string = 'mockAgentForCtx') {
    super({ name, description: 'mock agent desc for tool ctx' });
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

const mockTestAgentInstance = new MockAgentForToolContext();

const mockInvocationContext: InvocationContext = {
    invocationId: 'inv-ctx-tool-test',
    session: {
        id: 'sess-tool-test',
        userId: 'user-tool-test',
        appName: 'tool-test-app',
        events: [],
        state: new SessionState(),
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    runConfig: { 
        agentName: mockTestAgentInstance.name,
        input: { parts: [{ text: 'default tool test input' }] },
        defaultModelName: 'test-model-tool',
    } as RunConfig,
    agent: mockTestAgentInstance,
};

const createTestToolContext = (invocationCtx: InvocationContext = mockInvocationContext): ToolContext => ({
    invocationId: invocationCtx.invocationId,
    functionCallId: 'fc-tool-test-123',
    agentName: invocationCtx.agent.name,
    sessionState: invocationCtx.session.state,
    invocationContext: invocationCtx,
    actions: {},
});

describe('FunctionTool', () => {
  let mockContext: ToolContext;
  const baseProps: Omit<FunctionToolProps, 'func'> = {
    name: 'testFuncTool',
    description: 'A test function tool',
    parametersSchema: { 
        type: AdkJsonSchemaType.OBJECT, 
        properties: { 
            param1: { type: AdkJsonSchemaType.STRING, description: 'A string param' },
            param2: { type: AdkJsonSchemaType.NUMBER, nullable: true }
        },
        required: ['param1']
    } as AdkJsonSchema,
  };

  beforeEach(() => {
    mockContext = createTestToolContext();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  describe('Constructor', () => {
    it('should create an instance with valid properties', () => {
      const mockFunc = jest.fn();
      const tool = new FunctionTool({ ...baseProps, func: mockFunc });
      expect(tool).toBeInstanceOf(FunctionTool);
      expect(tool).toBeInstanceOf(BaseTool);
      expect(tool.name).toBe(baseProps.name);
      expect(tool.description).toBe(baseProps.description);
      expect(tool.parametersSchema).toEqual(baseProps.parametersSchema);
    });

    it('should throw an error if func is not a function', () => {
      expect(() => new FunctionTool({ ...baseProps, func: 'not-a-function' as any })).toThrow(
        `FunctionTool '${baseProps.name}': func property must be a function.`
      );
    });

    it('should default returnsContentDirectly to false', () => {
      const mockFunc = jest.fn();
      const tool = new FunctionTool({ ...baseProps, func: mockFunc });
      // Accessing private property for testing - consider if there's a better way or if it needs testing
      expect((tool as any).returnsContentDirectly).toBe(false);
    });

    it('should set returnsContentDirectly if provided', () => {
      const mockFunc = jest.fn();
      const tool = new FunctionTool({ ...baseProps, func: mockFunc, returnsContentDirectly: true });
      expect((tool as any).returnsContentDirectly).toBe(true);
    });
  });

  describe('asFunctionDeclaration (inherited from BaseTool)', () => {
    it('should return a valid FunctionDeclaration based on its properties', async () => {
      const mockFunc = jest.fn();
      const tool = new FunctionTool({ ...baseProps, func: mockFunc });
      const declaration = await tool.asFunctionDeclaration(mockContext);
      expect(declaration).toEqual({
        name: baseProps.name,
        description: baseProps.description,
        parameters: baseProps.parametersSchema,
      });
    });

    it('should return a FunctionDeclaration with parameters undefined if schema is not provided', async () => {
      const mockFunc = jest.fn();
      const propsWithoutSchema: FunctionToolProps = { name: 'noSchemaTool', description: 'desc', func: mockFunc };
      const tool = new FunctionTool(propsWithoutSchema);
      const declaration = await tool.asFunctionDeclaration();
      expect(declaration).toEqual({
        name: propsWithoutSchema.name,
        description: propsWithoutSchema.description,
        parameters: undefined,
      });
      expect(console.warn).toHaveBeenCalledWith(`Tool '${propsWithoutSchema.name}' has no parametersSchema defined. LLM may not be able to call it effectively if it expects parameters.`);
    });
  });

  describe('execute', () => {
    let mockFunc: jest.Mock<any, [Record<string, any>, ToolContext]>;

    beforeEach(() => {
      mockFunc = jest.fn();
    });

    it('should call the wrapped function with args and context', async () => {
      const tool = new FunctionTool({ ...baseProps, func: mockFunc });
      const args = { param1: 'test' };
      mockFunc.mockResolvedValue('simple result');

      await tool.execute(args, mockContext);
      expect(mockFunc).toHaveBeenCalledWith(args, mockContext);
    });

    describe('Default behavior (returnsContentDirectly = false or undefined)', () => {
      it('should wrap a string result in a Content object', async () => {
        const tool = new FunctionTool({ ...baseProps, func: mockFunc });
        const expectedText = 'simple string result';
        mockFunc.mockResolvedValue(expectedText);
        const result = await tool.execute({}, mockContext) as Content;
        expect(result.parts).toHaveLength(1);
        expect(result.parts[0].text).toBe(expectedText);
      });

      it('should wrap an object result by JSON stringifying it into a Content object', async () => {
        const tool = new FunctionTool({ ...baseProps, func: mockFunc });
        const objectResult = { data: 'value', count: 1 };
        mockFunc.mockResolvedValue(objectResult);
        const result = await tool.execute({}, mockContext) as Content;
        expect(result.parts).toHaveLength(1);
        expect(result.parts[0].text).toBe(JSON.stringify(objectResult, null, 2));
      });

      it('should return a default message if the function returns undefined', async () => {
        const tool = new FunctionTool({ ...baseProps, func: mockFunc });
        mockFunc.mockResolvedValue(undefined);
        const result = await tool.execute({}, mockContext) as Content;
        expect(result.parts).toHaveLength(1);
        expect(result.parts[0].text).toBe(`Tool '${baseProps.name}' executed successfully with no return value.`);
      });
    });

    describe('returnsContentDirectly = true', () => {
      it('should return Content object directly if function returns Content', async () => {
        const tool = new FunctionTool({ ...baseProps, func: mockFunc, returnsContentDirectly: true });
        const contentResult: Content = { parts: [{ text: 'direct content' }] };
        mockFunc.mockResolvedValue(contentResult);
        const result = await tool.execute({}, mockContext);
        expect(result).toBe(contentResult);
      });

      it('should return string directly if function returns a string', async () => {
        const tool = new FunctionTool({ ...baseProps, func: mockFunc, returnsContentDirectly: true });
        const stringResult = 'direct string content';
        mockFunc.mockResolvedValue(stringResult);
        const result = await tool.execute({}, mockContext);
        expect(result).toBe(stringResult);
      });

      it('should warn and wrap non-Content/non-string result as text part if returnsContentDirectly is true', async () => {
        const tool = new FunctionTool({ ...baseProps, func: mockFunc, returnsContentDirectly: true });
        const complexResult = { value: 123, nested: { data: 'abc'} };
        mockFunc.mockResolvedValue(complexResult);
        const result = await tool.execute({}, mockContext) as Content;
        expect(console.warn).toHaveBeenCalledWith(`FunctionTool '${baseProps.name}' was set to return Content directly, but did not receive a Content-like object or string. Wrapping as text.`);
        expect(result.parts).toHaveLength(1);
        expect(result.parts[0].text).toBe(JSON.stringify(complexResult, null, 2));
      });
    });

    it('should catch errors from the wrapped function and return error Content', async () => {
      const tool = new FunctionTool({ ...baseProps, func: mockFunc });
      const error = new Error('Function failed!');
      mockFunc.mockRejectedValue(error);
      const result = await tool.execute({}, mockContext) as Content;
      expect(console.error).toHaveBeenCalledWith(`FunctionTool '${baseProps.name}' execution error:`, error);
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0].text).toBe(`Error executing tool '${baseProps.name}': ${error.message}`);
    });
  });
}); 