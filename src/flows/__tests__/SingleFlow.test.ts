import { SingleFlow } from '../SingleFlow.js';
import { IBaseLlm } from '../../models/IBaseLlm.js';
import { LlmRequest } from '../../models/LlmRequest.js';
import { LlmResponse, Candidate } from '../../models/LlmResponse.js';
import { InvocationContext, InvocationServices } from '../../common/InvocationContext.js';
import { Event, EventType, EventData, EventSource, EventSourceType } from '../../common/Event.js';
import { Session, SessionState } from '../../common/Session.js';
import { RunConfig } from '../../common/RunConfig.js';
import { Content, FunctionCall, Part, FunctionResponse } from '../../models/LlmContent.js';
import { IAgent } from '../../agents/IAgent.js';
import { LlmAgentConfig } from '../../agents/LlmAgentConfig.js'; // For IAgent mock
import { IToolset } from '../../tools/IToolset.js'; // For IAgent mock
import { ILlmRegistry } from '../../llm/ILlmRegistry.js';
import { LlmRegistry } from '../../llm/LlmRegistry.js';
import { ISessionService } from '../../services/ISessionService.js'; 
import { IArtifactService } from '../../services/IArtifactService.js'; 
import { IMemoryService } from '../../services/IMemoryService.js';

// Mock IBaseLlm
const mockLlm: jest.Mocked<IBaseLlm> = {
  modelNamePattern: 'mock-model-pattern',
  generateContentAsync: jest.fn(),
  generateContentStreamAsync: jest.fn(),
  countTokensAsync: jest.fn(),
};

const mockLlmRegistry: jest.Mocked<ILlmRegistry> = {
    registerLlm: jest.fn(),
    getLlm: jest.fn().mockResolvedValue(mockLlm), // Default mock implementation
    listLlms: jest.fn().mockReturnValue([]),
    unregisterLlm: jest.fn().mockReturnValue(true),
  };

// Mock IAgent for InvocationContext
const mockAgent: jest.Mocked<IAgent> = {
  name: 'mock-agent',
  description: 'A mock agent',
  runAsync: jest.fn(),
  // Properties from IAgent interface
  llmConfig: undefined, // Optional
  toolset: undefined, // Optional
  parentAgent: undefined, // Optional
  subAgents: [], // Required
  findAgent: jest.fn(), // Required
  getRootAgent: jest.fn(() => mockAgent), // Required, returns itself for simplicity
  // beforeAgentCallback and afterAgentCallback are optional
};

describe('SingleFlow', () => {
  let singleFlow: SingleFlow;
  let mockContext: InvocationContext;
  let initialRequest: LlmRequest;
  let mockSessionState: SessionState;
  let mockDefaultLlmRegistry: jest.Mocked<ILlmRegistry>;

  beforeEach(() => {
    mockLlm.generateContentAsync.mockReset();
    mockLlm.countTokensAsync.mockReset();
    mockLlm.generateContentStreamAsync.mockReset();
    mockAgent.runAsync.mockReset();
    mockAgent.findAgent.mockReset();
    mockAgent.getRootAgent.mockReset();
    // Reset getRootAgent to return itself for each test context
    mockAgent.getRootAgent.mockImplementation(() => mockAgent);

    // Create a fresh mock registry for each test to avoid cross-test interference with getLlm mocks
    mockDefaultLlmRegistry = {
        registerLlm: jest.fn(),
        getLlm: jest.fn().mockResolvedValue(mockLlm), // Default for most tests
        listLlms: jest.fn().mockReturnValue([]),
        unregisterLlm: jest.fn().mockReturnValue(true),
    };

    singleFlow = new SingleFlow([], [], mockDefaultLlmRegistry); // Pass mock registry
    mockSessionState = new SessionState();

    const mockSession: Session = {
      id: 'session-123',
      userId: 'user-abc',
      appName: 'test-app',
      events: [],
      state: mockSessionState,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Correctly define mockRunConfig
    const completeMockRunConfig: RunConfig = {
      agentName: mockAgent.name, // Use mockAgent or a specific name
      input: { parts: [{ text: 'default single flow input' }] }, // Provide default input
      defaultModelName: 'mock-model',
      // traceEnabled: false, // Not a property of RunConfig
    };

    const services: InvocationServices = {
        sessionService: { getSession: jest.fn(), createSession: jest.fn(), updateSessionState: jest.fn(), appendEvent: jest.fn(), listSessions: jest.fn(), deleteSession: jest.fn(), clearAllSessions: jest.fn() } as jest.Mocked<ISessionService>,
        artifactService: { saveArtifact: jest.fn(), getArtifact: jest.fn(), listArtifacts: jest.fn(), deleteArtifact: jest.fn(), clearAllArtifacts: jest.fn() } as jest.Mocked<IArtifactService>,
        memoryService: { addEventsToHistory: jest.fn(), addMemory: jest.fn(), searchMemory: jest.fn(), deleteMemory: jest.fn(), retrieveMemory: jest.fn() } as jest.Mocked<IMemoryService>,
        llmRegistry: mockDefaultLlmRegistry, // Provide the test-specific registry to context
    };

    mockContext = {
      invocationId: 'inv-123',
      session: mockSession,
      runConfig: completeMockRunConfig, // Use the complete RunConfig
      agent: mockAgent,
      services: services, // Assign services to context
    };

    initialRequest = {
      model: 'mock-model',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      requestId: 'req-001',
    };
  });

  describe('runLlmInteraction - Basic Invocation', () => {
    it('should correctly process a simple request and return an LLM response event', async () => {
      const mockCandidateContent: Content = {
        role: 'model',
        parts: [{ text: 'Hi there!' }],
      };
      const mockLlmResponse: LlmResponse = {
        model: 'mock-model',
        candidates: [{ content: mockCandidateContent }],
        usageMetadata: { totalTokens: 10 },
      };
      mockLlm.generateContentAsync.mockResolvedValue(mockLlmResponse);

      const resultEvent = await singleFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

      expect(mockLlm.generateContentAsync).toHaveBeenCalledTimes(1);
      const processedRequest = mockLlm.generateContentAsync.mock.calls[0][0];
      expect(processedRequest.contents).toEqual(initialRequest.contents);
      expect(processedRequest.model).toEqual('mock-model');

      expect(resultEvent).toBeDefined();
      expect(resultEvent.type).toEqual(EventType.LLM_RESPONSE);
      expect(resultEvent.source).toEqual({ type: 'LLM' as EventSourceType, name: 'mock-model' });
      
      expect(resultEvent.llmResponse).toEqual(mockLlmResponse);
      
      expect(resultEvent.data).toBeDefined();
      expect(resultEvent.data!.content).toEqual(mockCandidateContent); 
      expect(resultEvent.data!.message).toBeUndefined();
      
      expect(mockSessionState.get('_requires_llm_rerun_with_tool_results')).toBeUndefined();
    });

    it('should return an error event if LLM interaction fails', async () => {
      const errorMessage = 'LLM API Error';
      const error = new Error(errorMessage);
      mockLlm.generateContentAsync.mockRejectedValue(error);

      const resultEvent = await singleFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

      expect(mockLlm.generateContentAsync).toHaveBeenCalledTimes(1);
      expect(resultEvent).toBeDefined();
      expect(resultEvent.type).toEqual(EventType.ERROR);
      expect(resultEvent.source).toEqual({ type: 'SYSTEM' as EventSourceType, name: 'SingleFlow' });
      
      expect(resultEvent.data).toBeDefined();
      expect(resultEvent.data!.error).toBeDefined();
      expect(resultEvent.data!.error?.message).toContain(errorMessage);
      
      expect(resultEvent.llmResponse).toBeDefined();
      expect(resultEvent.llmResponse!.error).toBeDefined();
      expect(resultEvent.llmResponse!.error?.message).toContain(errorMessage);
    });
  });
  
  describe('runLlmInteraction - Tool Calls', () => {
    it('should handle a function call, re-run LLM with tool results, and return final model response', async () => {
      const functionCallName = 'test_tool_function';
      const functionCallArgs = { arg1: 'value1' };
      const toolResultText = 'This is the result from the tool.';

      // 1. LLM responds with a FunctionCall
      const firstLlmResponse: LlmResponse = {
        model: 'mock-model',
        candidates: [{
          content: {
            role: 'model',
            parts: [{ functionCall: { name: functionCallName, args: functionCallArgs } as FunctionCall }],
          }
        }],
      };

      // 2. LLM responds with final answer after tool result is sent
      const finalCandidateContent: Content = {
        role: 'model',
        parts: [{ text: 'Okay, based on the tool result, the answer is X.' }],
      };
      const secondLlmResponse: LlmResponse = {
        model: 'mock-model',
        candidates: [{ content: finalCandidateContent }],
      };

      mockLlm.generateContentAsync
        .mockResolvedValueOnce(firstLlmResponse) // First call returns function call
        .mockResolvedValueOnce(secondLlmResponse); // Second call returns final answer

      // Simulate FunctionResponseProcessor's behavior:
      // It would process firstLlmResponse, execute the tool (mocked here implicitly),
      // then set up the context for a re-run with tool results.
      const originalApplyResponseProcessors = singleFlow.applyResponseProcessors.bind(singleFlow);
      jest.spyOn(singleFlow, 'applyResponseProcessors').mockImplementationOnce(async (response, request, context) => {
        // This mock is for the first LLM response (with the function call)
        if (response.candidates[0]?.content?.parts[0]?.functionCall) {
          // Simulate tool execution and preparing next request
          const toolResponsePart: Part = {
            functionResponse: {
              name: functionCallName,
              response: { content: toolResultText }, // Simplified tool response structure
            } as FunctionResponse,
          };
          const requestWithToolResults: LlmRequest = {
            ...initialRequest, // or derive from `request` argument
            contents: [...request.contents, { role: 'tool', parts: [toolResponsePart] }],
          };
          context.session.state.set('_requires_llm_rerun_with_tool_results', true);
          context.session.state.set('_current_llm_request_with_tool_results', requestWithToolResults);
          return response; // Return the original LlmResponse, SingleFlow loop will handle re-run based on state
        }
        // Fallback to original implementation for other scenarios (though not expected in this test path)
        return originalApplyResponseProcessors(response, request, context);
      });
      // For the second call to applyResponseProcessors (after second LLM call), let the original run.

      const resultEvent = await singleFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

      expect(mockLlm.generateContentAsync).toHaveBeenCalledTimes(2);

      // Check first call to LLM (initial request)
      expect(mockLlm.generateContentAsync.mock.calls[0][0]).toEqual(initialRequest);

      // Check second call to LLM (request with tool results)
      const secondLlmCallRequest = mockLlm.generateContentAsync.mock.calls[1][0];
      expect(secondLlmCallRequest.contents).toEqual(expect.arrayContaining([
        ...initialRequest.contents,
        expect.objectContaining({
          role: 'tool',
          parts: [expect.objectContaining({
            functionResponse: expect.objectContaining({
              name: functionCallName,
              response: { content: toolResultText },
            }),
          })],
        }),
      ]));

      expect(resultEvent).toBeDefined();
      expect(resultEvent.type).toEqual(EventType.LLM_RESPONSE);
      expect(resultEvent.source?.name).toEqual('mock-model');
      expect(resultEvent.data?.content).toEqual(finalCandidateContent);
      expect(mockContext.session.state.get('_requires_llm_rerun_with_tool_results')).toBeUndefined(); // Should be cleared
      expect(mockContext.session.state.get('_current_llm_request_with_tool_results')).toBeUndefined(); // Should be cleared

      // Restore the original method if it was spied upon and replaced
      jest.restoreAllMocks(); // Or mockApplyResponseProcessors.mockRestore(); if you stored the spy instance
    });
  });

  describe('runLlmInteraction - Flow Control', () => {
    const MAX_INTERACTIONS_IN_SINGLE_FLOW = 5; // Align with SingleFlow.ts

    it('should stop and return an error event if max interactions are reached', async () => {
      // LLM always responds with a function call to trigger loop
      const functionCallResponse: LlmResponse = {
        model: 'mock-model',
        candidates: [{
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'loop_inducing_tool', args: {} } as FunctionCall }],
          }
        }],
      };
      mockLlm.generateContentAsync.mockReturnValue(Promise.resolve(functionCallResponse));

      // Mock applyResponseProcessors to always set state for re-run
      const mockRequestWithLoopToolResults: LlmRequest = {
        ...initialRequest,
        contents: [...initialRequest.contents, { role: 'tool', parts: [{text: 'loop data'}] }], // Dummy tool result
      };
      jest.spyOn(singleFlow, 'applyResponseProcessors').mockImplementation(async (response, request, context) => {
        context.session.state.set('_requires_llm_rerun_with_tool_results', true);
        context.session.state.set('_current_llm_request_with_tool_results', mockRequestWithLoopToolResults);
        // Return the LlmResponse that would cause SingleFlow to check the state flags
        return response; 
      });

      const resultEvent = await singleFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

      expect(mockLlm.generateContentAsync).toHaveBeenCalledTimes(MAX_INTERACTIONS_IN_SINGLE_FLOW);
      
      expect(resultEvent).toBeDefined();
      expect(resultEvent.type).toEqual(EventType.ERROR);
      expect(resultEvent.source).toEqual({ type: 'SYSTEM' as EventSourceType, name: 'SingleFlow' });
      expect(resultEvent.data?.error?.message).toEqual('Max interactions reached');
      // The llmResponse in the event data might be the one from the last successful call before hitting max interactions
      expect(resultEvent.llmResponse).toBeDefined();
      expect(resultEvent.llmResponse?.error?.message).toEqual('Max interactions reached');

      jest.restoreAllMocks();
    });

    it('should return an event directly if applyResponseProcessors provides one', async () => {
      // LLM responds once
      const llmResponse: LlmResponse = {
        model: 'mock-model',
        candidates: [{ content: { role: 'model', parts: [{ text: 'Some LLM output.' }] } }],
      };
      mockLlm.generateContentAsync.mockResolvedValueOnce(llmResponse);

      // Predefined event to be returned by the mocked processor stage
      const predefinedEvent: Event = {
        eventId: 'proc-event-123',
        interactionId: mockContext.invocationId,
        sessionId: mockContext.session.id,
        type: EventType.TOOL_RESPONSE, // Example: a tool response that finalizes interaction
        source: { type: 'TOOL', name: 'MySpecialTool' },
        timestamp: new Date(),
        data: { message: 'Tool executed, no further LLM call needed.' },
      };

      // Mock applyResponseProcessors to return this predefined event
      const applyProcessorsSpy = jest.spyOn(singleFlow, 'applyResponseProcessors').mockResolvedValueOnce(predefinedEvent);

      const resultEvent = await singleFlow.runLlmInteraction(initialRequest, mockLlm, mockContext);

      expect(mockLlm.generateContentAsync).toHaveBeenCalledTimes(1);
      expect(applyProcessorsSpy).toHaveBeenCalledTimes(1);
      expect(applyProcessorsSpy).toHaveBeenCalledWith(llmResponse, expect.anything(), mockContext);
      
      // Ensure the returned event is the exact one from the processor
      expect(resultEvent).toBe(predefinedEvent);
      
      // Ensure no re-run was attempted
      expect(mockContext.session.state.get('_requires_llm_rerun_with_tool_results')).toBeUndefined();

      jest.restoreAllMocks();
    });
  });
}); 