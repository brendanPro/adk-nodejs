import { 
    LlmAgent, 
    SingleFlow, 
    RunConfig,
    InMemorySessionService,
    InMemoryArtifactService,
    InMemoryMemoryService,
    InvocationContext,
    Runner,
    OllamaLlm,
    LlmRegistry  // Now properly exported from main index
  } from '../../dist/index.js';
  import * as readline from 'readline';
  
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
  
// 6. Create readline interface for console input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to get user input
function getUserInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

// 7. Interactive chat loop
async function runInteractiveChat() {
  console.log('🚀 Starting interactive chat with local Ollama model...');
  console.log('📝 Make sure Ollama is running: ollama serve');
  console.log('📦 And your model is installed: ollama pull llama3.2');
  console.log('💡 Type "exit" or "quit" to end the conversation');
  console.log('');

  let sessionId: string | undefined = undefined;
  
  while (true) {
    try {
      // Get user input
      const userInput = await getUserInput('👤 You: ');
      
      // Check for exit commands
      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        console.log('👋 Goodbye!');
        rl.close();
        break;
      }
      
      // Skip empty input
      if (!userInput.trim()) {
        continue;
      }
      
      const runConfig: RunConfig = {
        agentName: 'LocalAssistant',
        input: userInput,
        userId: 'local-user',
        sessionId: sessionId, // Reuse session for conversation history
        defaultModelName: 'llama3.2'
      };

      console.log('🤖 Assistant: ');
      
      // Stream events as they occur
      for await (const event of runner.runAgent(runConfig)) {

        
        // Store session ID for conversation continuity
        if (event.invocationContext?.session?.sessionId) {
          sessionId = event.invocationContext.session.sessionId;
        }
        
        // Show the LLM response
        if (event.type === 'LLM_RESPONSE' && event.data?.content?.parts?.[0]?.text) {
          console.log(event.data.content.parts[0].text);
        }
        
        if (event.type === 'ERROR') {
          console.log('❌ Error:', event.data?.error?.message);
          break;
        }
      }
      
      console.log(''); // Add newline for better readability
      
    } catch (error: any) {
      console.error('💥 Error:', error.message);
      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('   1. Make sure Ollama is running: ollama serve');
      console.log('   2. Install a model: ollama pull llama3.2');
      console.log('   3. Check if the model name matches what you have installed');
      console.log('   4. Verify Ollama is accessible at http://localhost:11434');
      console.log('');
    }
  }
}

runInteractiveChat();
