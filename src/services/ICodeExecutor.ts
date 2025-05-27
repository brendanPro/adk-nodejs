import { InvocationContext } from '../common/InvocationContext.js';

export interface CodeExecutionResult {
  stdout?: string;
  stderr?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  // We might want to include information about generated artifacts (files) here later.
  // artifacts?: { name: string, path: string, type: string }[];
}

export interface ICodeExecutor {
  /**
   * Executes a given code snippet.
   * @param language The programming language of the code (e.g., 'python', 'javascript').
   * @param code The code snippet to execute.
   * @param context The current invocation context, which might provide execution environment details or artifact storage.
   * @returns A promise that resolves to the execution result.
   */
  execute(language: string, code: string, context: InvocationContext): Promise<CodeExecutionResult>;
} 