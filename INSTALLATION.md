# Installation Guide

## Installing the ADK Node.js Module

### Using Bun (Recommended)

```bash
bun add adk-nodejs
```

### Using npm

```bash
npm install adk-nodejs
```

### Using yarn

```bash
yarn add adk-nodejs
```

## Basic Usage

After installation, you can import and use the ADK components:

```typescript
import { 
  LlmAgent, 
  Runner, 
  BaseToolset, 
  FunctionTool,
  InMemorySessionService,
  InMemoryArtifactService,
  InMemoryMemoryService,
  LlmRegistry,
  GeminiLlm
} from 'adk-nodejs';

// Create and register LLM
const geminiLlm = new GeminiLlm({
  modelName: 'gemini-1.5-flash',
  apiKey: process.env.GOOGLE_API_KEY
});

const llmRegistry = new LlmRegistry();
llmRegistry.registerLlm('gemini-1.5-flash', geminiLlm);

// Create a simple agent
const chatAgent = new LlmAgent({
  name: 'ChatBot',
  description: 'A helpful chat assistant',
  llmConfig: {
    modelName: 'gemini-1.5-flash',
    systemInstruction: 'You are a helpful and friendly assistant.',
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 500
    }
  }
});

// Create a runner
const runner = new Runner(
  new InMemorySessionService(),
  new InMemoryArtifactService(),
  new InMemoryMemoryService(),
  async (agentName) => chatAgent,
  llmRegistry  // Pass the registry
);

// Run the agent
const runConfig = {
  agentName: 'ChatBot',
  input: 'Hello! How can you help me today?',
  userId: 'user123'
};

for await (const event of runner.runAgent(runConfig)) {
  console.log(`Event: ${event.type}`, event.data);
}
```

## TypeScript Support

The module includes full TypeScript definitions. No additional `@types` packages are needed.

```typescript
import type { IAgent, LlmAgentConfig, RunConfig } from 'adk-nodejs';
```

## Development Setup

If you want to contribute or modify the module:

1. Clone the repository
2. Install dependencies: `bun install`
3. Build the project: `bun run build`
4. Run tests: `bun test`

## Requirements

- Node.js >= 18.0.0
- Bun >= 1.0.0 (if using Bun)

## Documentation

- [AGENTS.md](./AGENTS.md) - Comprehensive guide to building agents
- [README.md](./README.md) - Project overview and getting started
