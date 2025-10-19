# Local LLM Integration Guide

This guide shows you how to use local LLMs with the ADK Node.js framework instead of cloud-based models like Gemini.

## 🏠 **Supported Local LLM Servers**

### 1. **Ollama** (Recommended)
- **Website**: [ollama.ai](https://ollama.ai/)
- **Best for**: Easy setup, wide model support
- **Default endpoint**: `http://localhost:11434`

### 2. **LM Studio**
- **Website**: [lmstudio.ai](https://lmstudio.ai/)
- **Best for**: GUI-based model management
- **Default endpoint**: `http://localhost:1234`

### 3. **text-generation-webui**
- **GitHub**: [oobabooga/text-generation-webui](https://github.com/oobabooga/text-generation-webui)
- **Best for**: Advanced configuration options
- **Default endpoint**: `http://localhost:5000`

### 4. **vLLM**
- **GitHub**: [vllm-project/vllm](https://github.com/vllm-project/vllm)
- **Best for**: High-performance inference
- **Default endpoint**: `http://localhost:8000`

## 🚀 **Quick Start Examples**

### **Option 1: Using Ollama**

```bash
# 1. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Start Ollama
ollama serve

# 3. Install a model
ollama pull llama3.2

# 4. Run the example
bun run example-ollama.ts
```

### **Option 2: Using LM Studio**

```bash
# 1. Download and install LM Studio from lmstudio.ai
# 2. Load a model in LM Studio
# 3. Start the local server in LM Studio
# 4. Run the example
bun run example-lmstudio.ts
```

## 🔧 **Custom Implementation**

### **Creating Your Own Local LLM Class**

```typescript
import { LocalLlm, LocalLlmConfig } from 'adk-nodejs';

class MyCustomLlm extends LocalLlm {
  constructor(config: LocalLlmConfig) {
    super({
      endpoint: 'http://localhost:8080', // Your custom endpoint
      ...config
    });
  }

  // Override methods as needed for your specific API
  protected async callLocalLlm(prompt: string, stream: boolean): Promise<any> {
    // Your custom API call logic here
    const response = await fetch(`${this.config.endpoint}/your-api-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        model: this.config.modelName,
        stream: stream
        // Add your API-specific parameters
      })
    });

    return stream ? this.parseStreamResponse(response) : await response.json();
  }
}
```

### **Using Your Custom LLM**

```typescript
import { LlmAgent, Runner, LlmRegistry } from 'adk-nodejs';

// Create your custom LLM
const customLlm = new MyCustomLlm({
  modelName: 'my-local-model',
  endpoint: 'http://localhost:8080',
  timeout: 30000
});

// Register it
const llmRegistry = new LlmRegistry();
llmRegistry.registerLlm('my-local-model', customLlm);

// Use it in an agent
const agent = new LlmAgent({
  name: 'CustomAgent',
  description: 'Agent using my custom local LLM',
  llmConfig: {
    modelName: 'my-local-model',
    instructions: 'You are a helpful assistant.'
  }
});

// Create runner and use as normal
const runner = new Runner(
  sessionService,
  artifactService,
  memoryService,
  agentFactory,
  llmRegistry
);
```

## 📋 **Available Models by Platform**

### **Ollama Models**
```bash
# Popular models you can install:
ollama pull llama3.2          # Meta's Llama 3.2
ollama pull mistral           # Mistral 7B
ollama pull codellama         # Code-focused Llama
ollama pull phi3              # Microsoft Phi-3
ollama pull gemma2            # Google Gemma 2
ollama pull qwen2             # Alibaba Qwen 2

# List installed models:
ollama list
```

### **LM Studio Models**
- Browse and download models directly in the LM Studio GUI
- Supports GGUF format models from Hugging Face
- Popular choices: Llama, Mistral, CodeLlama, Phi-3

## ⚙️ **Configuration Options**

### **LocalLlmConfig Interface**
```typescript
interface LocalLlmConfig {
  modelName: string;        // Name of your local model
  endpoint: string;         // Server endpoint (e.g., 'http://localhost:11434')
  apiKey?: string;         // Optional API key if your server requires auth
  timeout?: number;        // Request timeout in milliseconds (default: 30000)
  maxRetries?: number;     // Number of retries for failed requests (default: 3)
}
```

### **Model-Specific Parameters**
You can customize the model parameters by overriding the `callLocalLlm` method:

```typescript
class CustomOllamaLlm extends OllamaLlm {
  protected async callLocalLlm(prompt: string, stream: boolean): Promise<any> {
    const requestBody = {
      model: this.config.modelName,
      prompt: prompt,
      stream: stream,
      options: {
        temperature: 0.8,      // Creativity level (0.0 - 2.0)
        top_p: 0.9,           // Nucleus sampling
        top_k: 40,            // Top-k sampling
        repeat_penalty: 1.1,   // Repetition penalty
        num_predict: 2000,     // Max tokens to generate
        num_ctx: 4096,        // Context window size
      }
    };

    // ... rest of the implementation
  }
}
```

## 🔍 **Troubleshooting**

### **Common Issues**

1. **Connection Refused**
   ```
   Error: fetch failed (connection refused)
   ```
   - **Solution**: Make sure your local LLM server is running
   - **Check**: `curl http://localhost:11434/api/tags` (for Ollama)

2. **Model Not Found**
   ```
   Error: model 'llama3.2' not found
   ```
   - **Solution**: Install the model first
   - **Ollama**: `ollama pull llama3.2`
   - **LM Studio**: Download model in the GUI

3. **Timeout Errors**
   ```
   Error: Request timeout
   ```
   - **Solution**: Increase timeout in config
   - **Code**: `timeout: 120000` (2 minutes)

4. **Out of Memory**
   ```
   Error: CUDA out of memory
   ```
   - **Solution**: Use a smaller model or increase system RAM/VRAM
   - **Alternative**: Use CPU-only inference

### **Performance Tips**

1. **Use GPU acceleration** when available
2. **Choose appropriate model size** for your hardware
3. **Adjust context window** based on your needs
4. **Enable model caching** to avoid reloading
5. **Use streaming** for better user experience

## 📊 **Model Recommendations by Use Case**

| Use Case | Recommended Models | Size | Notes |
|----------|-------------------|------|-------|
| **General Chat** | Llama 3.2, Mistral 7B | 3-7B | Good balance of quality and speed |
| **Code Generation** | CodeLlama, DeepSeek Coder | 7-13B | Specialized for programming tasks |
| **Creative Writing** | Mistral, Llama 3.2 | 7-70B | Higher creativity, needs more resources |
| **Fast Responses** | Phi-3, Gemma 2 | 3-7B | Optimized for speed |
| **Multilingual** | Qwen 2, Llama 3.2 | 7-72B | Strong non-English support |

## 🔗 **Integration Examples**

### **Multiple Local Models**
```typescript
// Register multiple local models
const llmRegistry = new LlmRegistry();

// Fast model for quick responses
const fastModel = new OllamaLlm({ modelName: 'phi3', endpoint: 'http://localhost:11434' });
llmRegistry.registerLlm('fast-model', fastModel);

// Powerful model for complex tasks
const powerfulModel = new OllamaLlm({ modelName: 'llama3.2:70b', endpoint: 'http://localhost:11434' });
llmRegistry.registerLlm('powerful-model', powerfulModel);

// Use different models for different agents
const quickAgent = new LlmAgent({
  name: 'QuickAssistant',
  llmConfig: { modelName: 'fast-model' }
});

const deepAgent = new LlmAgent({
  name: 'DeepThinker', 
  llmConfig: { modelName: 'powerful-model' }
});
```

### **Hybrid Cloud + Local Setup**
```typescript
// Mix local and cloud models
const llmRegistry = new LlmRegistry();

// Local model for privacy-sensitive tasks
const localModel = new OllamaLlm({ modelName: 'llama3.2' });
llmRegistry.registerLlm('private-model', localModel);

// Cloud model for complex tasks
const cloudModel = new GeminiLlm({ modelName: 'gemini-1.5-pro', apiKey: process.env.GOOGLE_API_KEY });
llmRegistry.registerLlm('cloud-model', cloudModel);
```

## 🎯 **Next Steps**

1. **Choose your local LLM platform** (Ollama recommended for beginners)
2. **Install and set up** your chosen platform
3. **Download a model** appropriate for your hardware
4. **Run the examples** to test your setup
5. **Customize the implementation** for your specific needs

Your local LLM is now ready to use with the ADK framework! 🚀
