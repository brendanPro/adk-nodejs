import { InvocationContext } from '../common/InvocationContext.js';
import { ICodeExecutor, CodeExecutionResult } from './ICodeExecutor.js';
import { spawn } from 'child_process';
// import fs from 'fs/promises'; // No longer writing to temp files
// import fsSync from 'fs'; // No longer writing to temp files
// import path from 'path'; // No longer writing to temp files
// import os from 'os'; // No longer writing to temp files
// import { v4 as uuidv4 } from 'uuid'; // Not strictly needed if not creating unique file names

export class LocalCodeExecutor implements ICodeExecutor {
  // private tempDir: string; // No longer needed

  constructor() {
    // this.tempDir = tempDir || path.join(os.tmpdir(), 'adk-code-exec'); // No longer needed
  }

  // private async ensureTempDirExists(): Promise<void> { ... } // No longer needed

  async execute(language: string, code: string, context: InvocationContext): Promise<CodeExecutionResult> {
    // const runId = context.invocationId || uuidv4(); // Not strictly needed for stdin

    if (language.toLowerCase() !== 'python') {
      return {
        error: {
          name: 'UnsupportedLanguageError',
          message: `Language '${language}' is not supported. Currently, only 'python' is supported.`,
        },
      };
    }

    // console.log(`[LocalCodeExecutor DEBUG] Executing Python via stdin with code:\n${code}`);

    return new Promise((resolve) => {
      // Use '-' as the argument to tell Python to read from stdin
      const pythonProcess = spawn('python3', ['-']); 

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('error', (processError) => {
        // console.error('[LocalCodeExecutor DEBUG] Process spawn error:', processError);
        resolve({
          stdout,
          stderr,
          error: {
            name: processError.name || 'ProcessSpawnError',
            message: processError.message || 'Failed to start Python process.',
            stack: processError.stack,
          },
        });
      });
      
      pythonProcess.on('close', (exitCode) => {
        // console.log(`[LocalCodeExecutor DEBUG] Python process (stdin) closed with code: ${exitCode}`);
        if (exitCode === 0) {
          resolve({ stdout, stderr });
        } else {
          resolve({
            stdout,
            stderr,
            error: {
              name: 'ExecutionError',
              message: `Python script (stdin) exited with code ${exitCode}. ${stderr ? 'See stderr for details.' : ''}`,
            },
          });
        }
      });

      // Write code to stdin and close it
      pythonProcess.stdin.write(code);
      pythonProcess.stdin.end();
    });
  }
} 