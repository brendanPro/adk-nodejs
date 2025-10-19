import { LocalLlm, LocalLlmConfig } from './LocalLlm.js';

/**
 * Ollama-specific LLM implementation
 * Works with Ollama running locally (https://ollama.ai/)
 */
export class OllamaLlm extends LocalLlm {
  constructor(config: Omit<LocalLlmConfig, 'endpoint'> & { endpoint?: string }) {
    super({
      endpoint: 'http://localhost:11434',
      ...config
    });
  }

  protected async callLocalLlm(prompt: string, stream: boolean): Promise<any> {
    const requestBody = {
      model: this.config.modelName,
      prompt: prompt,
      stream: stream,
      options: {
        temperature: 0.7,
        num_predict: 1000,
        // Ollama-specific options
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.1
      }
    };

    const response = await fetch(`${this.config.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    if (stream) {
      return this.parseStreamResponse(response);
    } else {
      return await response.json();
    }
  }
}
