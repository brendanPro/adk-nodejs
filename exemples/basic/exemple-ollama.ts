import { 
    InMemoryArtifactService,
    InMemoryMemoryService, 
    InMemorySessionService, 
    InvocationContext, 
    LlmAgent, 
    LlmRegistry, 
    OllamaLlm, 
    RunConfig, 
    Runner, 
    SingleFlow 
} from "../../dist/index.js";

console.log('🦙 ADK with Ollama Local LLM Example');
console.log('=====================================');

// 1. Create services
const sessionService = new InMemorySessionService();
const artifactService = new InMemoryArtifactService();
const memoryService = new InMemoryMemoryService();

// 2. Create and register the Ollama LLM
const ollamaLlm = new OllamaLlm({
  modelName: 'llama3.2',  // Change this to your installed model
  endpoint: 'http://localhost:11434', // Default Ollama endpoint
  timeout: 60000 // 60 seconds timeout for local models
});

// Create an instance-based registry and register the LLM
const llmRegistry = new LlmRegistry();
llmRegistry.registerLlm('llama3.2', ollamaLlm);

console.log('✅ Ollama LLM registered');

// 3. Create an agent
const agent = new LlmAgent({
  name: 'LocalAssistant',
  description: 'A helpful AI assistant running locally with Ollama',
  llmConfig: {
    modelName: 'llama3.2',
    instructions: 'You are a helpful assistant running locally. Be concise and friendly.'
  },
  flow: new SingleFlow()
});

  // 4. Create agent factory
  const agentFactory = async (agentName: string, runConfig: RunConfig, invocationContext: InvocationContext) => {
    if (agentName === 'LocalAssistant') {
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
    llmRegistry
  );

  // 6. Run the agent
  async function runOllamaExample() {
    console.log('🚀 Starting conversation with Ollama model...');
    console.log('📝 Make sure Ollama is running with a model loaded');
    console.log('🌐 Server should be accessible at http://localhost:11434');
    console.log('');

    const runConfig: RunConfig = {
      agentName: 'LocalAssistant',
      input: 'Hello! What can you help me with today?',
      userId: 'ollama-user',
      defaultModelName: 'llama3.2'
    };

    try {
      // Stream events as they occur
      for await (const event of runner.runAgent(runConfig)) {
        console.log(`📨 Event: ${event.type}`);

        if (event.type === 'LLM_RESPONSE' && event.data?.content?.parts?.[0]?.text) {
          console.log('🤖 Response:', event.data.content.parts[0].text);
        }
        
        if (event.type === 'ERROR') {
          console.log('❌ Error:', event.data?.error?.message);
          break;
        }
      }

      console.log(''); // Add newline for better readability
      
    } catch (error: any) {
      console.error('💥 Failed to run example:', error.message);
      console.log('');
    }
  }

runOllamaExample();