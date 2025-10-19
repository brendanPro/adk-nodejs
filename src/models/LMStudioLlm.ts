import { LocalLlm, LocalLlmConfig } from './LocalLlm.js';
import { LlmRequest, LlmResponse } from './index.js';

/**
 * LM Studio-specific LLM implementation
 * Works with LM Studio local server (https://lmstudio.ai/)
 */
export class LMStudioLlm extends LocalLlm {
  constructor(config: Omit<LocalLlmConfig, 'endpoint'> & { endpoint?: string }) {
    super({
      endpoint: 'http://localhost:1234',
      ...config
    });
  }

  protected async callLocalLlm(prompt: string, stream: boolean): Promise<any> {
    // LM Studio uses OpenAI-compatible API
    const requestBody = {
      model: this.config.modelName,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: stream,
      temperature: 0.7,
      max_tokens: 1000
    };

    const response = await fetch(`${this.config.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`LM Studio request failed: ${response.status} ${response.statusText}`);
    }

    if (stream) {
      return this.parseOpenAIStreamResponse(response);
    } else {
      return await response.json();
    }
  }

  private async *parseOpenAIStreamResponse(response: Response): AsyncGenerator<any> {
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
            const data = line.slice(6);
            if (data === '[DONE]') return;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                yield {
                  response: parsed.choices[0].delta.content,
                  done: parsed.choices[0].finish_reason !== null
                };
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
    // Handle OpenAI-style response format
    if (response.choices) {
      const text = response.choices[0]?.message?.content || response.choices[0]?.delta?.content || '';
      return {
        model: request.model || this.config.modelName,
        requestId: request.requestId,
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text }]
            },
            finishReason: response.choices[0]?.finish_reason === 'stop' ? 'STOP' as const : undefined
          }
        ],
        usageMetadata: response.usage ? {
          promptTokenCount: response.usage.prompt_tokens || 0,
          candidatesTokenCount: response.usage.completion_tokens || 0,
          totalTokenCount: response.usage.total_tokens || 0
        } : undefined
      };
    }

    // Fallback to parent implementation
    return super.convertResponseToLlmResponse(response, request);
  }
}
