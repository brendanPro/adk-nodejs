import { CodeExecutionTool } from '../CodeExecutionTool.js';
import { ICodeExecutor, CodeExecutionResult } from '../../services/ICodeExecutor.js';
import { InvocationContext } from '../../common/InvocationContext.js';
import { ToolContext, createToolContext } from '../../common/ToolContext.js';
import { CODE_EXECUTION_TOOL_NAME } from '../../flows/processors/CodeExecutionRequestProcessor.js';
import { AdkJsonSchemaType, Content } from '../../models/LlmContent.js';
import { Session } from '../../common/Session.js';
import { RunConfig } from '../../common/RunConfig.js';
import { IAgent } from '../../agents/IAgent.js';

// Mocks
const mockExecute = jest.fn();
const mockCodeExecutor: ICodeExecutor = {
  execute: mockExecute,
};

const mockAgent = { name: 'TestAgentForTool' } as IAgent;
const mockSession = { id: 'tool-test-sess', state: new Map(), events: [] } as unknown as Session;
const mockRunConfig = {} as RunConfig;

const createMockInvocationContext = (executorInServices?: ICodeExecutor): InvocationContext => ({
  invocationId: 'tool-inv-456',
  agent: mockAgent,
  session: mockSession,
  runConfig: mockRunConfig,
  services: {
    codeExecutor: executorInServices,
  },
});

describe('CodeExecutionTool', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  test('asFunctionDeclaration should return correct schema', async () => {
    const tool = new CodeExecutionTool();
    const declaration = await tool.asFunctionDeclaration();
    expect(declaration.name).toBe(CODE_EXECUTION_TOOL_NAME);
    expect(declaration.description).toBeDefined();
    expect(declaration.parameters).toEqual({
      type: AdkJsonSchemaType.OBJECT,
      properties: {
        language: {
          type: AdkJsonSchemaType.STRING,
          description: expect.any(String),
        },
        code: {
          type: AdkJsonSchemaType.STRING,
          description: expect.any(String),
        },
      },
      required: ['language', 'code'],
    });
  });

  describe('execute method', () => {
    test('should use codeExecutor from constructor if provided', async () => {
      const tool = new CodeExecutionTool(mockCodeExecutor);
      const invContext = createMockInvocationContext(); // No executor in services
      const toolContext = createToolContext(invContext, 'call-001');
      const mockResult: CodeExecutionResult = { stdout: 'from constructor exec' };
      mockExecute.mockResolvedValue(mockResult);

      const responseContent = await tool.execute({ language: 'python', code: 'print(1)' }, toolContext);
      
      expect(mockExecute).toHaveBeenCalledWith('python', 'print(1)', invContext);
      expect(responseContent.parts[0].text).toContain('Stdout:\nfrom constructor exec');
    });

    test('should use codeExecutor from InvocationContext.services if not in constructor', async () => {
      const tool = new CodeExecutionTool(); // No executor in constructor
      const invContext = createMockInvocationContext(mockCodeExecutor); // Executor in services
      const toolContext = createToolContext(invContext, 'call-002');
      const mockResult: CodeExecutionResult = { stdout: 'from services exec' };
      mockExecute.mockResolvedValue(mockResult);

      const responseContent = await tool.execute({ language: 'python', code: 'print(2)' }, toolContext);

      expect(mockExecute).toHaveBeenCalledWith('python', 'print(2)', invContext);
      expect(responseContent.parts[0].text).toContain('Stdout:\nfrom services exec');
    });

    test('should return error if no codeExecutor is available', async () => {
      const tool = new CodeExecutionTool();
      const invContext = createMockInvocationContext(); // No executor anywhere
      const toolContext = createToolContext(invContext, 'call-003');
      
      const responseContent = await tool.execute({ language: 'python', code: 'print(3)' }, toolContext);
      
      expect(mockExecute).not.toHaveBeenCalled();
      expect(responseContent.parts[0].text).toContain('Error: Code execution service is not available');
    });
    
    test('should return error if InvocationContext is missing in ToolContext', async () => {
        const tool = new CodeExecutionTool(mockCodeExecutor);
        const minimalToolContext: ToolContext = {
            invocationId: 'minimal-inv',
            functionCallId: 'minimal-fc',
            agentName: 'minimal-agent',
            sessionState: new Map() as any,
            actions: {},
            // invocationContext: undefined, // Explicitly undefined
        };
        
        const responseContent = await tool.execute({ language: 'python', code: 'print(3)' }, minimalToolContext);
        expect(mockExecute).not.toHaveBeenCalled();
        expect(responseContent.parts[0].text).toContain('Error: InvocationContext not available in ToolContext');
    });

    test('should return error if language or code arguments are missing', async () => {
      const tool = new CodeExecutionTool(mockCodeExecutor);
      const invContext = createMockInvocationContext();
      const toolContext = createToolContext(invContext, 'call-004');

      let responseContent = await tool.execute({ code: 'print(4)' } as any, toolContext);
      expect(responseContent.parts[0].text).toContain("Missing 'language' or 'code' argument");

      responseContent = await tool.execute({ language: 'python' } as any, toolContext);
      expect(responseContent.parts[0].text).toContain("Missing 'language' or 'code' argument");
      
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test('should correctly format successful execution result', async () => {
      const tool = new CodeExecutionTool(mockCodeExecutor);
      const invContext = createMockInvocationContext();
      const toolContext = createToolContext(invContext, 'call-005');
      const mockResult: CodeExecutionResult = { stdout: 'OK', stderr: 'Warning' };
      mockExecute.mockResolvedValue(mockResult);

      const responseContent = await tool.execute({ language: 'python', code: 'print("OK")' }, toolContext);
      
      expect(responseContent.parts[0].text).toBe('Stdout:\nOK\nStderr:\nWarning');
    });
    
    test('should correctly format execution result with only stdout', async () => {
      const tool = new CodeExecutionTool(mockCodeExecutor);
      const invContext = createMockInvocationContext();
      const toolContext = createToolContext(invContext, 'call-005a');
      const mockResult: CodeExecutionResult = { stdout: 'Only stdout' };
      mockExecute.mockResolvedValue(mockResult);

      const responseContent = await tool.execute({ language: 'python', code: 'print("stdout")' }, toolContext);
      expect(responseContent.parts[0].text).toBe('Stdout:\nOnly stdout');
    });
    
    test('should correctly format execution result with only stderr', async () => {
      const tool = new CodeExecutionTool(mockCodeExecutor);
      const invContext = createMockInvocationContext();
      const toolContext = createToolContext(invContext, 'call-005b');
      const mockResult: CodeExecutionResult = { stderr: 'Only stderr' };
      mockExecute.mockResolvedValue(mockResult);

      const responseContent = await tool.execute({ language: 'python', code: 'import sys; sys.stderr.write("stderr")' }, toolContext);
      expect(responseContent.parts[0].text).toBe('Stderr:\nOnly stderr');
    });
    
    test('should return "Code executed successfully with no output" if no output and no error', async () => {
        const tool = new CodeExecutionTool(mockCodeExecutor);
        const invContext = createMockInvocationContext();
        const toolContext = createToolContext(invContext, 'call-005c');
        const mockResult: CodeExecutionResult = { }; // No stdout, stderr, or error
        mockExecute.mockResolvedValue(mockResult);
  
        const responseContent = await tool.execute({ language: 'python', code: 'pass' }, toolContext);
        expect(responseContent.parts[0].text).toBe('Code executed successfully with no output.');
      });

    test('should correctly format execution error result', async () => {
      const tool = new CodeExecutionTool(mockCodeExecutor);
      const invContext = createMockInvocationContext();
      const toolContext = createToolContext(invContext, 'call-006');
      const mockResult: CodeExecutionResult = { 
        error: { name: 'SyntaxError', message: 'Invalid syntax', stack: 'Traceback...' } 
      };
      mockExecute.mockResolvedValue(mockResult);

      const responseContent = await tool.execute({ language: 'python', code: 'print bad' }, toolContext);
      
      expect(responseContent.parts[0].text).toBe('Error: SyntaxError - Invalid syntax\nStack:\nTraceback...');
    });

    test('should handle error thrown by codeExecutor.execute', async () => {
      const tool = new CodeExecutionTool(mockCodeExecutor);
      const invContext = createMockInvocationContext();
      const toolContext = createToolContext(invContext, 'call-007');
      const errorMessage = 'Executor blew up';
      mockExecute.mockRejectedValue(new Error(errorMessage));

      const responseContent = await tool.execute({ language: 'python', code: 'explode()' }, toolContext);
      
      expect(responseContent.parts[0].text).toBe(`Execution failed for tool ${tool.name}: ${errorMessage}`);
    });
  });
}); 