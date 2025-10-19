import { 
    LlmAgent, 
    SingleFlow, 
    RunConfig,
    InMemorySessionService,
    InMemoryArtifactService,
    InMemoryMemoryService,
    InvocationContext,
    Runner,
    GeminiLlm,
    LlmRegistry  // Now properly exported from main index
  } from './dist/index.js';
  
  // 1. Create services
  const sessionService = new InMemorySessionService();
  const artifactService = new InMemoryArtifactService();
  const memoryService = new InMemoryMemoryService();
  
  // 2. Create and register the Gemini LLM
  const geminiLlm = new GeminiLlm({
    modelName: 'gemini-2.0-flash',
    apiKey: process.env.GOOGLE_API_KEY // Make sure this is set in your environment
  });
  
  // Create an instance-based registry and register the LLM
  const llmRegistry = new LlmRegistry();
  llmRegistry.registerLlm('gemini-2.0-flash', geminiLlm);
  
  // 3. Create an agent
  const agent = new LlmAgent({
    name: 'assistant',
    description: 'A helpful AI assistant',
    llmConfig: {
      modelName: 'gemini-2.0-flash',
      instructions: 'You are a helpful assistant.'
    },
    flow: new SingleFlow() // Optional, defaults to SingleFlow
  });
  
  // 4. Create agent factory
  const agentFactory = async (agentName: string, runConfig: RunConfig, invocationContext: InvocationContext) => {
    if (agentName === 'assistant') {
      return agent;
    }
    return undefined;
  };
  
  // 5. Create runner with LlmRegistry
  const runner = new Runner(
    sessionService,
    artifactService,
    memoryService,
    agentFactory,
    llmRegistry // Pass the registry to the runner
  );
  
  // 6. Run the agent
  async function runExample() {
    const runConfig: RunConfig = {
      agentName: 'assistant',
      input: 'Hello, how can you help me?',
      userId: 'user123',
      defaultModelName: 'gemini-2.0-flash'
    };
  
    // Stream events as they occur
    for await (const event of runner.runAgent(runConfig)) {
      console.log(`Event: ${event.type}`, event.data);
    }
  }
  
  runExample();