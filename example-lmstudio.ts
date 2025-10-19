import { 
    LlmAgent, 
    SingleFlow, 
    RunConfig,
    InMemorySessionService,
    InMemoryArtifactService,
    InMemoryMemoryService,
    InvocationContext,
    Runner,
    LMStudioLlm,
    LlmRegistry  // Now properly exported from main index
  } from './dist/index.js';
  
  console.log('🎬 ADK with LM Studio Local LLM Example');
  console.log('======================================');
  
  // 1. Create services
  const sessionService = new InMemorySessionService();
  const artifactService = new InMemoryArtifactService();
  const memoryService = new InMemoryMemoryService();
  
  // 2. Create and register the LM Studio LLM
  const lmStudioLlm = new LMStudioLlm({
    modelName: 'local-model',  // This can be any name you choose
    endpoint: 'http://localhost:1234', // Default LM Studio endpoint
    timeout: 60000 // 60 seconds timeout for local models
  });
  
  // Create an instance-based registry and register the LLM
  const llmRegistry = new LlmRegistry();
  llmRegistry.registerLlm('local-model', lmStudioLlm);
  
  console.log('✅ LM Studio LLM registered');
  
  // 3. Create an agent
  const agent = new LlmAgent({
    name: 'StudioAssistant',
    description: 'A helpful AI assistant running locally with LM Studio',
    llmConfig: {
      modelName: 'local-model',
      instructions: 'You are a helpful assistant running locally via LM Studio. Be concise and helpful.'
    },
    flow: new SingleFlow()
  });
  
  // 4. Create agent factory
  const agentFactory = async (agentName: string, runConfig: RunConfig, invocationContext: InvocationContext) => {
    if (agentName === 'StudioAssistant') {
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
  async function runLMStudioExample() {
    console.log('🚀 Starting conversation with LM Studio model...');
    console.log('📝 Make sure LM Studio is running with a model loaded');
    console.log('🌐 Server should be accessible at http://localhost:1234');
    console.log('');
    
    const runConfig: RunConfig = {
      agentName: 'StudioAssistant',
      input: 'Hello! What can you help me with today?',
      userId: 'studio-user',
      defaultModelName: 'local-model'
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
    } catch (error: any) {
      console.error('💥 Failed to run example:', error.message);
      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('   1. Make sure LM Studio is running');
      console.log('   2. Load a model in LM Studio');
      console.log('   3. Enable the local server in LM Studio');
      console.log('   4. Verify the server is at http://localhost:1234');
      console.log('   5. Check that CORS is enabled if needed');
    }
  }
  
  runLMStudioExample();
