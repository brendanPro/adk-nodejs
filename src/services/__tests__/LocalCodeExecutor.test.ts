import { LocalCodeExecutor } from '../LocalCodeExecutor.js';
import { InvocationContext } from '../../common/InvocationContext.js';
import { Session } from '../../common/Session.js';
import { RunConfig } from '../../common/RunConfig.js';
import { IAgent } from '../../agents/IAgent.js';
// import fs from 'fs/promises'; // No longer needed for these tests
// import path from 'path'; // No longer needed for these tests
// import { jest } from '@jest/globals'; // Keep if other Jest features are used, else remove

// Mock parts of InvocationContext if necessary, or create a minimal version
const mockAgent = { name: 'TestAgent' } as IAgent;
const mockSession = { id: 'test-sess', state: new Map() } as unknown as Session;
const mockRunConfig = {} as RunConfig;

const createMockContext = (): InvocationContext => ({
  invocationId: 'test-inv-123',
  agent: mockAgent,
  session: mockSession,
  runConfig: mockRunConfig,
  services: {},
});

describe('LocalCodeExecutor', () => {
  let executor: LocalCodeExecutor;
  // const testTempDir = path.join(process.cwd(), 'src', 'services', '__tests__', '.test_temp'); // No longer needed

  // beforeAll(async () => { ... }); // No longer needed

  beforeEach(() => {
    executor = new LocalCodeExecutor(); // Constructor no longer takes tempDir
  });

  // afterEach(async () => { ... }); // No longer needed
  // afterAll(async () => { ... }); // No longer needed

  test('should execute valid Python code and return stdout', async () => {
    const context = createMockContext();
    const pythonCode = 'print("Hello from Python")';
    const result = await executor.execute('python', pythonCode, context);

    expect(result.stdout).toBe('Hello from Python\n');
    expect(result.stderr).toBe('');
    expect(result.error).toBeUndefined();
  });

  test('should capture stderr from Python code', async () => {
    const context = createMockContext();
    const pythonCode = 'import sys; sys.stderr.write("Error output")';
    const result = await executor.execute('python', pythonCode, context);

    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Error output');
    expect(result.error).toBeUndefined();
  });

  test('should handle Python script with non-zero exit code', async () => {
    const context = createMockContext();
    const pythonCode = 'import sys; sys.exit(1)';
    const result = await executor.execute('python', pythonCode, context);
    
    expect(result.error).toBeDefined();
    expect(result.error?.name).toBe('ExecutionError');
    expect(result.error?.message).toContain('Python script (stdin) exited with code 1');
  });
  
  test('should handle Python script with syntax error', async () => {
    const context = createMockContext();
    // Python 3 syntax error example: print statement without parentheses if exec'd directly by some py2 environments by mistake
    // but for python3, a more direct syntax error for stdin would be something incomplete or malformed.
    const pythonCode = 'print("Hello"\nprint("World")'; // Malformed string over newline for syntax error
    const result = await executor.execute('python', pythonCode, context);

    expect(result.error).toBeDefined();
    expect(result.error?.name).toBe('ExecutionError'); 
    expect(result.stderr).toMatch(/SyntaxError/);
  });

  test('should return error for unsupported language', async () => {
    const context = createMockContext();
    const code = 'console.log("Hello from JS")';
    const result = await executor.execute('javascript', code, context);

    expect(result.error).toBeDefined();
    expect(result.error?.name).toBe('UnsupportedLanguageError');
    expect(result.error?.message).toContain("Language 'javascript' is not supported");
  });

  // Test for file cleanup is removed as temp files are no longer used.
}); 