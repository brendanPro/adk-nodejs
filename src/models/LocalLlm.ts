import { IBaseLlm } from './IBaseLlm.js';
import { LlmRequest } from './LlmRequest.js';
import { LlmResponse } from './LlmResponse.js';
import { Content, FinishReasonType } from './LlmContent.js';

export interface LocalLlmConfig {
  modelName: string;
  endpoint: string;           // e.g., 'http://localhost:11434' for Ollama
  apiKey?: string;           // Optional API key if your local server requires it
  timeout?: number;          // Request timeout in milliseconds
  maxRetries?: number;       // Number of retries for failed requests
}

/**
 * Local LLM implementation that can work with various local LLM servers
 * (Ollama, LM Studio, text-generation-webui, vLLM, etc.)
 */
export class LocalLlm implements IBaseLlm {
  public readonly modelNamePattern: string;
  protected config: LocalLlmConfig;

  constructor(config: LocalLlmConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      ...config
    };
    this.modelNamePattern = config.modelName;
  }

  async generateContentAsync(request: LlmRequest): Promise<LlmResponse> {
    try {
      const prompt = this.convertRequestToPrompt(request);
      const response = await this.callLocalLlm(prompt, false);
      return this.convertResponseToLlmResponse(response, request);
    } catch (error: any) {
      console.error(`LocalLlm (${this.config.modelName}): Error in generateContentAsync`, error);
      return {
        model: request.model || this.config.modelName,
        requestId: request.requestId,
        candidates: [],
        error: {
          code: error.status || 500,
          message: error.message || 'Local LLM request failed',
          details: error.stack
        }
      };
    }
  }

  async *generateContentStreamAsync(request: LlmRequest): AsyncGenerator<LlmResponse, void, unknown> {
    try {
      const prompt = this.convertRequestToPrompt(request);
      const stream = await this.callLocalLlm(prompt, true);
      
      for await (const chunk of stream) {
        yield this.convertResponseToLlmResponse(chunk, request);
      }
    } catch (error: any) {
      console.error(`LocalLlm (${this.config.modelName}): Error in generateContentStreamAsync`, error);
      yield {
        model: request.model || this.config.modelName,
        requestId: request.requestId,
        candidates: [],
        error: {
          code: error.status || 500,
          message: error.message || 'Local LLM streaming failed',
          details: error.stack
        }
      };
    }
  }

  async countTokensAsync(request: LlmRequest): Promise<number> {
    // Simple token estimation - you can improve this based on your model's tokenizer
    const prompt = this.convertRequestToPrompt(request);
    // Rough estimation: ~4 characters per token for most models
    return Math.ceil(prompt.length / 4);
  }

  protected convertRequestToPrompt(request: LlmRequest): string {
    let prompt = '';
    
    // Add system instruction if present
    if (request.systemInstruction) {
      if (typeof request.systemInstruction === 'string') {
        prompt += `System: ${request.systemInstruction}\n\n`;
      } else {
        const systemText = request.systemInstruction.parts
          .map(part => part.text || '')
          .join(' ');
        prompt += `System: ${systemText}\n\n`;
      }
    }

    // Convert contents to prompt format
    for (const content of request.contents) {
      const role = content.role || 'user';
      const text = content.parts.map(part => part.text || '').join(' ');
      prompt += `${role.charAt(0).toUpperCase() + role.slice(1)}: ${text}\n`;
    }

    prompt += 'Assistant: ';
    return prompt;
  }

  protected async callLocalLlm(prompt: string, stream: boolean): Promise<any> {
    const requestBody = {
      model: this.config.modelName,
      prompt: prompt,
      stream: stream,
      options: {
        temperature: 0.7,
        max_tokens: 1000,
        // Add other model-specific options here
      }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.endpoint}/api/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`Local LLM request failed: ${response.status} ${response.statusText}`);
    }

    if (stream) {
      return this.parseStreamResponse(response);
    } else {
      return await response.json();
    }
  }

  protected async *parseStreamResponse(response: Response): AsyncGenerator<any> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.response) {
                yield data;
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  protected convertResponseToLlmResponse(response: any, request: LlmRequest): LlmResponse {
    const text = response.response || response.choices?.[0]?.text || response.content || '';
    
    return {
      model: request.model || this.config.modelName,
      requestId: request.requestId,
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text }]
          },
          finishReason: response.done ? 'STOP' as FinishReasonType : undefined
        }
      ],
      usageMetadata: {
        promptTokenCount: response.prompt_eval_count || 0,
        candidatesTokenCount: response.eval_count || 0,
        totalTokenCount: (response.prompt_eval_count || 0) + (response.eval_count || 0)
      }
    };
  }
}
