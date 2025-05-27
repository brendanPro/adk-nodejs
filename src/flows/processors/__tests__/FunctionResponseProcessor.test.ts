import { FunctionResponseProcessor } from '../FunctionResponseProcessor.js';
import { LlmResponse, Candidate } from '../../../models/LlmResponse.js';
import { InvocationContext } from '../../../common/InvocationContext.js';
import { IToolset } from '../../../tools/IToolset.js';
import { ITool } from '../../../tools/ITool.js';
import { Content, Part, FunctionCall, FunctionResponse } from '../../../models/LlmContent.js';
import { BaseAgent } from '../../../agents/BaseAgent.js';
import { Session, SessionState } from '../../../common/Session.js';
import { RunConfig } from '../../../common/RunConfig.js';
import { IAgent } from '../../../agents/IAgent.js';
import { Event, EventType, EventSource } from '../../../common/Event.js';
import { IBaseLlmFlow } from '../../../flows/IBaseLlmFlow.js';
import { LlmRequest } from '../../../models/LlmRequest.js';
import { createToolContext } from '../../../common/ToolContext.js';

// jest.mock('../../../common/ToolContext.js'); // If we need to mock createToolContext

// Minimal concrete class for BaseAgent instantiation in tests
class MockTestAgent extends BaseAgent {
  protected flow?: IBaseLlmFlow = undefined;
  // Allow toolset to be publicly assignable for testing
  public toolset?: IToolset = undefined;
  constructor(props: { name: string; description: string; toolset?: IToolset }) {
    super(props);
    this.toolset = props.toolset;
  }
  protected getInitialLlmRequest(context: InvocationContext): LlmRequest {
    return { model: 'mock-test-agent-model', contents: [], requestId: context.invocationId };
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
        data: { message: `MockTestAgent ${this.name} executed.` }
    };
    if (context.session && context.session.events) {
        context.session.events.push(mockEvent);
    }
    yield mockEvent;
    return mockEvent;
  }
}

const mockBaseTool: ITool = {
    name: 'testTool',
    description: 'A test tool',
    execute: jest.fn(), 
    asFunctionDeclaration: jest.fn().mockResolvedValue({
        name: 'testTool',
        description: 'A test tool description for LLM',
    }),
};

// Mocks
const mockToolset: jest.Mocked<IToolset> = {
  name: 'mock-toolset',
  getFunctionDeclarations: jest.fn(),
  executeTool: jest.fn(),
  getTool: jest.fn().mockReturnValue(mockBaseTool), // Default to returning a mock tool
  getTools: jest.fn(),
  addTool: jest.fn(),
  removeTool: jest.fn(),
};

describe('FunctionResponseProcessor', () => {
  let processor: FunctionResponseProcessor;
  let mockContext: InvocationContext;
  let mockSession: Session;
  let mockAgentWithToolset: MockTestAgent;
  let mockAgentWithoutToolset: MockTestAgent;
  let baseLlmResponse: LlmResponse;
  let mockLlmRequest: LlmRequest;
  let llmResponseWithToolCall: LlmResponse;
  const toolCall1: FunctionCall = { name: 'testTool1', args: { paramA: 'valueA' } };
  const toolCallPart1: Part = { functionCall: toolCall1 };

  beforeEach(() => {
    jest.resetAllMocks();

    mockAgentWithoutToolset = new MockTestAgent({ name: 'testAgentNoToolset', description: 'desc' });
    mockAgentWithToolset = new MockTestAgent({ 
        name: 'testAgentWithToolset', 
        description: 'desc', 
        toolset: mockToolset 
    });

    mockSession = {
      id: 'session-123',
      userId: 'user-abc',
      appName: 'test-app',
      events: [],
      state: new SessionState(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    mockContext = {
      invocationId: 'inv-1',
      session: mockSession,
      runConfig: {
        agentName: mockAgentWithoutToolset.name, 
        input: { parts: [{ text: 'default test input for func response proc'}]},
        defaultModelName: 'test-model',
      },
      agent: mockAgentWithoutToolset, 
    };

    mockLlmRequest = {
      model: 'test-model',
      contents: [{ role: 'user', parts: [{text: 'Hello'}]}],
      requestId: 'req-123',
    };

    baseLlmResponse = {
      model: 'test-model',
      candidates: [
        {
          content: { role: 'assistant', parts: [{ text: 'No tool calls here.' }] },
          generationInfo: { finishReason: 'STOP' },
        },
      ],
      usageMetadata: { totalTokenCount: 10 },
    };

    llmResponseWithToolCall = {
        model: 'test-model',
        candidates: [
            {
                content: { role: 'assistant', parts: [toolCallPart1] },
                generationInfo: { finishReason: 'TOOL_CALLS' }, // Typical finish reason
            }
        ],
        usageMetadata: { totalTokenCount: 20 },
    };
  });

  it('should return original response if LLM response has no tool calls', async () => {
    processor = new FunctionResponseProcessor(mockToolset);
    const result = await processor.processResponse(baseLlmResponse, mockLlmRequest, mockContext);
    expect(result).toBe(baseLlmResponse);
    expect(mockToolset.executeTool).not.toHaveBeenCalled();
  });

  it('should return original response if LLM response candidates are empty', async () => {
    processor = new FunctionResponseProcessor(mockToolset);
    const responseWithNoCandidates: LlmResponse = { ...baseLlmResponse, candidates: [] };
    const result = await processor.processResponse(responseWithNoCandidates, mockLlmRequest, mockContext);
    expect(result).toBe(responseWithNoCandidates);
  });
  
  it('should return original response if LLM response candidate.content is null', async () => {
    processor = new FunctionResponseProcessor(mockToolset);
    const responseWithNullContent: LlmResponse = { 
        ...baseLlmResponse, 
        candidates: [{ ...baseLlmResponse.candidates[0], content: null as any }] 
    };
    const result = await processor.processResponse(responseWithNullContent, mockLlmRequest, mockContext);
    expect(result).toBe(responseWithNullContent);
  });

  it('should return original response if LLM response has no functionCalls or toolCall parts (via extractFunctionCalls logic)', async () => {
    processor = new FunctionResponseProcessor(mockToolset);
    const candidateWithTextContent: Candidate = {
        content: { role: 'assistant', parts: [{text: 'some content'}] },
        generationInfo: { finishReason: 'STOP' },
    };

    // Scenario 1: candidate.content.parts has no functionCall, and candidate.functionCalls is undefined
    let responseNoToolIndicators: LlmResponse = {
      ...baseLlmResponse,
      candidates: [candidateWithTextContent],
    };
    let result = await processor.processResponse(responseNoToolIndicators, mockLlmRequest, mockContext);
    expect(result).toBe(responseNoToolIndicators);

    // Scenario 2: candidate.functionCalls is explicitly empty array
    const candidateWithEmptyFunctionCalls: Candidate = { 
        ...candidateWithTextContent, 
        functionCalls: [], // Explicitly empty
    }; 
    let responseWithEmptyFunctionCallsArray: LlmResponse = {
        ...baseLlmResponse,
        candidates: [candidateWithEmptyFunctionCalls],
    };
    result = await processor.processResponse(responseWithEmptyFunctionCallsArray, mockLlmRequest, mockContext);
    expect(result).toBe(responseWithEmptyFunctionCallsArray);
  });
  
  describe('Tool Execution Scenarios', () => {
    it('should execute a tool call and return a TOOL_RESPONSE event when toolset is from constructor', async () => {
      processor = new FunctionResponseProcessor(mockToolset);
      const toolResultContent: Content = { parts: [{ text: 'Tool1 result' }] };
      mockToolset.executeTool.mockResolvedValue(toolResultContent);
      mockContext.agent = mockAgentWithoutToolset; // this agent has a name: 'testAgentNoToolset'
      mockToolset.getTool.mockReturnValue({ ...mockBaseTool, name: toolCall1.name });

      const result = await processor.processResponse(llmResponseWithToolCall, mockLlmRequest, mockContext) as Event;

      expect(mockToolset.getTool).toHaveBeenCalledWith(toolCall1.name);
      expect(mockToolset.executeTool).toHaveBeenCalledWith(
        toolCall1.name, 
        toolCall1.args, 
        expect.objectContaining({ 
          invocationId: mockContext.invocationId, 
          functionCallId: expect.any(String),
          agentName: mockAgentWithoutToolset.name, // Check agentName
          sessionState: mockContext.session.state, // Check sessionState
          invocationContext: mockContext // Check that the original invocationContext is passed through
        })
      );
      expect(result).toBeDefined();
      expect(result.type).toBe(EventType.TOOL_RESPONSE);
      expect(result.data!.content!.parts).toHaveLength(1);
      const responsePart = result.data!.content!.parts[0].functionResponse;
      expect(responsePart?.name).toBe(toolCall1.name);
      expect(responsePart?.response).toEqual(toolResultContent);
      expect(result._originalFunctionCalls).toBeDefined();
      const originalFcKeys = Object.keys(result._originalFunctionCalls!);
      expect(originalFcKeys[0]).toMatch(new RegExp(`^${mockContext.invocationId}-fc-`));
      expect(result._originalFunctionCalls![originalFcKeys[0]]).toEqual(toolCall1);
    });

    it('should execute a tool call using toolset from agent context if constructor has no toolset', async () => {
      processor = new FunctionResponseProcessor(); 
      mockContext.agent = mockAgentWithToolset; 
      
      const agentToolset = mockAgentWithToolset.toolset as jest.Mocked<IToolset>; 
      const toolResultContent: Content = { parts: [{ text: 'Agent tool result' }] };
      agentToolset.executeTool.mockResolvedValue(toolResultContent);
      agentToolset.getTool.mockReturnValue({ ...mockBaseTool, name: toolCall1.name });

      const result = await processor.processResponse(llmResponseWithToolCall, mockLlmRequest, mockContext) as Event;

      expect(agentToolset.getTool).toHaveBeenCalledWith(toolCall1.name);
      expect(agentToolset.executeTool).toHaveBeenCalledWith(
        toolCall1.name, 
        toolCall1.args, 
        expect.anything()
      );
      expect(result.type).toBe(EventType.TOOL_RESPONSE);
      expect(result.data!.content!.parts[0].functionResponse?.response).toEqual(toolResultContent);
    });

    it('should prioritize constructor-provided toolset over agent.toolset', async () => {
      const constructorToolset = { ...mockToolset, executeTool: jest.fn(), getTool: jest.fn() } as jest.Mocked<IToolset>;
      const agentSideToolset = { ...mockToolset, executeTool: jest.fn(), getTool: jest.fn() } as jest.Mocked<IToolset>; 
      (mockAgentWithToolset as any).toolset = agentSideToolset; 
      mockContext.agent = mockAgentWithToolset;

      processor = new FunctionResponseProcessor(constructorToolset);
      const constructorToolResult: Content = { parts: [{ text: 'Constructor tool wins' }] };
      constructorToolset.executeTool.mockResolvedValue(constructorToolResult);
      constructorToolset.getTool.mockReturnValue({ ...mockBaseTool, name: toolCall1.name });

      const result = await processor.processResponse(llmResponseWithToolCall, mockLlmRequest, mockContext) as Event;

      expect(constructorToolset.executeTool).toHaveBeenCalledTimes(1);
      expect(agentSideToolset.executeTool).not.toHaveBeenCalled();
      expect(result.data!.content!.parts[0].functionResponse?.response).toEqual(constructorToolResult);
    });

    it('should return a TOOL_RESPONSE event with an error part if tool is not found', async () => {
      processor = new FunctionResponseProcessor(mockToolset);
      mockToolset.getTool.mockReturnValue(undefined); // Tool not found
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error

      const result = await processor.processResponse(llmResponseWithToolCall, mockLlmRequest, mockContext) as Event;
      
      expect(result.type).toBe(EventType.TOOL_RESPONSE);
      const responsePart = result.data!.content!.parts[0].functionResponse;
      expect(responsePart?.name).toBe(toolCall1.name);
      expect(responsePart?.response.parts[0].text).toContain(`Tool '${toolCall1.name}' not found`);
      expect(mockToolset.executeTool).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore(); // Restore console.error
    });

    it('should return a TOOL_RESPONSE event with an error part if tool execution throws error', async () => {
      processor = new FunctionResponseProcessor(mockToolset);
      const executionError = new Error('Tool Boom!');
      mockToolset.executeTool.mockRejectedValue(executionError);
      mockToolset.getTool.mockReturnValue({ ...mockBaseTool, name: toolCall1.name }); // Tool is found
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error

      const result = await processor.processResponse(llmResponseWithToolCall, mockLlmRequest, mockContext) as Event;

      expect(result.type).toBe(EventType.TOOL_RESPONSE);
      const responsePart = result.data!.content!.parts[0].functionResponse;
      expect(responsePart?.name).toBe(toolCall1.name);
      expect(responsePart?.response.parts[0].text).toContain(`Error executing tool '${toolCall1.name}': Tool Boom!`);
      consoleErrorSpy.mockRestore(); // Restore console.error
    });

    it('should return original response and log warning if no toolset is available anywhere', async () => {
      processor = new FunctionResponseProcessor(); // No toolset in constructor
      mockContext.agent = mockAgentWithoutToolset; // Agent also has no toolset
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await processor.processResponse(llmResponseWithToolCall, mockLlmRequest, mockContext);

      expect(result).toBe(llmResponseWithToolCall); // Returns original response
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'FunctionResponseProcessor: Function call received, but no toolset is available to execute it.'
      );
      expect(mockToolset.executeTool).not.toHaveBeenCalled(); // Mock toolset should not be involved
      consoleWarnSpy.mockRestore();
    });

    it('should execute multiple tool calls and include all results in the TOOL_RESPONSE event', async () => {
      processor = new FunctionResponseProcessor(mockToolset);

      const toolCall2: FunctionCall = { name: 'testTool2', args: { paramB: 42 } };
      const toolCallPart2: Part = { functionCall: toolCall2 };

      const llmResponseWithMultipleToolCalls: LlmResponse = {
        model: 'test-model',
        candidates: [
            {
                content: { role: 'assistant', parts: [toolCallPart1, toolCallPart2] }, // Has toolCallPart1 and toolCallPart2
                generationInfo: { finishReason: 'TOOL_CALLS' },
            }
        ],
        usageMetadata: { totalTokenCount: 30 },
      };

      const tool1ResultContent: Content = { parts: [{ text: 'Tool1 specific result' }] };
      const tool2ResultContent: Content = { parts: [{ text: 'Tool2 amazing output' }] };

      const mockTool1: ITool = { 
        ...mockBaseTool, 
        name: toolCall1.name, 
        asFunctionDeclaration: jest.fn().mockResolvedValue({ name: toolCall1.name, description: 'Tool 1'})
      };
      const mockTool2: ITool = { 
        ...mockBaseTool, 
        name: toolCall2.name, 
        asFunctionDeclaration: jest.fn().mockResolvedValue({ name: toolCall2.name, description: 'Tool 2'})
      };

      mockToolset.getTool
        .mockReturnValueOnce(mockTool1)
        .mockReturnValueOnce(mockTool2);
      
      mockToolset.executeTool
        .mockImplementation(async (toolName: string) => { 
          if (toolName === toolCall1.name) return tool1ResultContent;
          if (toolName === toolCall2.name) return tool2ResultContent;
          throw new Error('Unknown tool in multi-call test');
        });

      const result = await processor.processResponse(llmResponseWithMultipleToolCalls, mockLlmRequest, mockContext) as Event;

      expect(result.type).toBe(EventType.TOOL_RESPONSE);
      expect(mockToolset.getTool).toHaveBeenCalledWith(toolCall1.name);
      expect(mockToolset.getTool).toHaveBeenCalledWith(toolCall2.name);
      expect(mockToolset.executeTool).toHaveBeenCalledWith(toolCall1.name, toolCall1.args, expect.anything());
      expect(mockToolset.executeTool).toHaveBeenCalledWith(toolCall2.name, toolCall2.args, expect.anything());

      expect(result.data!.content!.parts).toHaveLength(2);
      const responsePart1 = result.data!.content!.parts.find(p => p.functionResponse?.name === toolCall1.name)?.functionResponse;
      const responsePart2 = result.data!.content!.parts.find(p => p.functionResponse?.name === toolCall2.name)?.functionResponse;

      expect(responsePart1).toBeDefined();
      expect(responsePart1?.response).toEqual(tool1ResultContent);
      expect(responsePart2).toBeDefined();
      expect(responsePart2?.response).toEqual(tool2ResultContent);

      expect(Object.keys(result._originalFunctionCalls!)).toHaveLength(2);
      const originalFcKeys = Object.keys(result._originalFunctionCalls!);
      const originalFcValues = originalFcKeys.map(key => result._originalFunctionCalls![key]);
      expect(originalFcValues).toContainEqual(toolCall1);
      expect(originalFcValues).toContainEqual(toolCall2);
    });
  });
  
  // TODO: Tests for specific callback invocations (before/after/error on the tool itself)
}); 