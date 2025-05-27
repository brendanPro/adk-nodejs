# Agent Development Kit (ADK)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

<html>
    <h2 align="center">
      <img src="https://raw.githubusercontent.com/google/adk-python/main/assets/agent-development-kit.png" width="256"/>
    </h2>
    <h3 align="center">
      An open-source, code-first NodeJS toolkit for building, evaluating, and deploying sophisticated AI agents with flexibility and control.
    </h3>
</html>

# Agent Development Kit (ADK) - Node.js Codebase Analysis

## High-Level Overview

The Agent Development Kit (ADK) is a flexible, modular framework for building and deploying AI agents. The Node.js implementation provides a TypeScript-based toolkit that's model-agnostic and designed to make agent development feel more like traditional software development.

### Key Characteristics
- **Event-driven architecture**: All interactions are modeled as events that flow through the system
- **Modular design**: Pluggable components for flows, processors, tools, and services
- **LLM-agnostic**: Works with different language models (optimized for Gemini but extensible)
- **Session management**: Persistent conversation state and history
- **Tool integration**: Rich ecosystem for extending agent capabilities

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Runner      │────│     Agent       │────│     Flow        │
│   (Orchestrator)│    │   (Business     │    │  (Interaction   │
│                 │    │    Logic)       │    │    Pattern)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Services     │    │     Tools       │    │   Processors    │
│  (Session,      │    │  (Functions,    │    │  (Request/      │
│   Memory, etc.) │    │   APIs, etc.)   │    │   Response)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components Deep Dive

### 1. Runner (`src/Runner.ts`)
The **Runner** is the main orchestrator that manages the entire agent execution lifecycle.

**Key Responsibilities:**
- Session management (create/retrieve sessions)
- Event streaming and persistence
- Agent factory resolution
- Error handling and cleanup
- Converting user input to events

**Core Method:**
```typescript
async *runAgent(runConfig: RunConfig): AsyncGenerator<Event, RunOutput, undefined>
```

### 2. Agents (`src/agents/`)

#### BaseAgent (`BaseAgent.ts`)
Abstract base class providing common agent functionality:
- Agent hierarchy management (parent/sub-agents)
- Invocation context creation
- Agent discovery (`findAgent`)

#### LlmAgent (`LlmAgent.ts`)
Concrete implementation for LLM-powered agents:
- **Flow integration**: Uses configurable flows for interaction patterns
- **Tool integration**: Supports toolsets for extended capabilities
- **LLM configuration**: Model selection, generation parameters, safety settings
- **Event generation**: Creates and yields events throughout execution

**Key Features:**
- Configurable flows (SingleFlow, AutoFlow)
- Before/after agent callbacks
- Agent transfer capabilities
- Error handling and recovery

### 3. Flows (`src/flows/`)

Flows define interaction patterns between agents and LLMs.

#### SingleFlow (`SingleFlow.ts`)
Handles single request-response cycles with tool support:
- **Tool execution loop**: Automatically handles function calls from LLM
- **Event creation**: Generates `LLM_RESPONSE` events for each interaction
- **State management**: Uses session state for coordination
- **Max iterations**: Prevents infinite loops (default: 5)

#### AutoFlow (`AutoFlow.ts`)
More complex flow with automatic planning and execution phases.

#### Flow Processors (`src/flows/processors/`)
Modular components that process requests and responses:

**Request Processors:**
- `BasicRequestProcessor`: Basic request setup
- `InstructionsRequestProcessor`: System instructions handling
- `ContentRequestProcessor`: Content formatting
- `FunctionRequestProcessor`: Tool/function setup
- `CodeExecutionRequestProcessor`: Code execution setup

**Response Processors:**
- `FunctionResponseProcessor`: Tool execution and response handling
- `CodeExecutionResponseProcessor`: Code execution results
- `AuthResponseProcessor`: Authentication flow handling

### 4. Event System (`src/common/Event.ts`)

Events are the core communication mechanism in ADK:

```typescript
interface Event {
  readonly eventId: string;
  readonly interactionId: string;
  readonly sessionId: string;
  readonly type: EventType;
  readonly source: EventSource;
  readonly timestamp: Date;
  readonly data?: EventData;
  // ... other fields
}
```

**Event Types:**
- `MESSAGE`: User/agent messages
- `LLM_REQUEST`/`LLM_RESPONSE`: LLM interactions
- `TOOL_CALL`/`TOOL_RESULT`: Tool executions
- `INVOCATION_START`/`INVOCATION_END`: Agent lifecycle
- `ERROR`: Error conditions
- `AGENT_TRANSFER`: Agent handoffs

### 5. Session Management (`src/common/Session.ts`)

Sessions maintain conversation state:
- **Events**: Complete interaction history
- **State**: Key-value store for temporary data
- **Metadata**: User ID, app name, timestamps

### 6. Tools and Services

**Tools** extend agent capabilities:
- Function calling interface
- Before/after execution callbacks
- Context-aware execution

**Services** provide infrastructure:
- `ISessionService`: Session persistence
- `IArtifactService`: File/artifact storage
- `IMemoryService`: Long-term memory
- `ICodeExecutor`: Code execution sandbox

## Usage Examples

### Basic Agent Creation and Execution

```typescript
import { 
  LlmAgent, 
  SingleFlow, 
  RunConfig,
  InMemorySessionService,
  InMemoryArtifactService,
  InMemoryMemoryService,
  EventType,
  InvocationContext
} from 'google-adk-nodejs';

// 1. Create services
const sessionService = new InMemorySessionService();
const artifactService = new InMemoryArtifactService();
const memoryService = new InMemoryMemoryService();
// Note: LlmRegistry is a static class, no instantiation needed

// 2. Create an agent
const agent = new LlmAgent({
  name: 'assistant',
  description: 'A helpful AI assistant',
  llmConfig: {
    modelName: 'gemini-2.0-flash',
    instructions: 'You are a helpful assistant.'
  },
  flow: new SingleFlow() // Optional, defaults to SingleFlow
});

// 3. Create agent factory
const agentFactory = async (agentName: string, runConfig: RunConfig, invocationContext: InvocationContext) => {
  if (agentName === 'assistant') {
    return agent;
  }
  return undefined;
};

// 4. Create runner
const runner = new Runner(
  sessionService,
  artifactService,
  memoryService,
  agentFactory
  // LlmRegistry is static, no need to pass instance
);

// 5. Run the agent
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
```

### Agent with Tools

```typescript
import { BaseToolset, ITool, ToolContext, FunctionDeclaration, AdkJsonSchemaType } from 'google-adk-nodejs';

// Create a custom tool
class WeatherTool implements ITool {
  name = 'get_weather';
  description = 'Get current weather for a location';
  
  async asFunctionDeclaration(context?: ToolContext): Promise<FunctionDeclaration> {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: AdkJsonSchemaType.OBJECT,
        properties: {
          location: {
            type: AdkJsonSchemaType.STRING,
            description: 'The location to get weather for'
          }
        },
        required: ['location']
      }
    };
  }
  
  async execute(args: any, context: ToolContext): Promise<string> {
    const location = args.location;
    // Simulate weather API call
    return `The weather in ${location} is sunny, 72°F`;
  }
}

// Create toolset
const toolset = new BaseToolset({ name: 'WeatherToolset' });
toolset.addTool(new WeatherTool());

// Create agent with tools
const weatherAgent = new LlmAgent({
  name: 'weather_assistant',
  description: 'An assistant that can check weather',
  toolset: toolset,
  llmConfig: {
    modelName: 'gemini-2.0-flash',
    instructions: 'You can help users check weather. Use the get_weather tool when needed.'
  }
});
```

### Multi-Agent System

```typescript
// Create specialized agents
const greeterAgent = new LlmAgent({
  name: 'greeter',
  description: 'Handles greetings and introductions',
  llmConfig: {
    modelName: 'gemini-2.0-flash',
    systemInstruction: 'You are a friendly greeter. Keep responses brief and welcoming.'
  }
});

const taskAgent = new LlmAgent({
  name: 'task_executor',
  description: 'Handles task execution and problem solving',
  llmConfig: {
    modelName: 'gemini-2.0-flash',
    systemInstruction: 'You are a task executor. Focus on solving problems efficiently.'
  }
});

// Create coordinator agent
const coordinator = new LlmAgent({
  name: 'coordinator',
  description: 'Coordinates between different specialized agents',
  subAgents: [greeterAgent, taskAgent],
  llmConfig: {
    modelName: 'gemini-2.0-flash',
    systemInstruction: `You coordinate between agents:
    - Use 'greeter' for welcomes and introductions
    - Use 'task_executor' for problem-solving tasks`
  }
});

// Agent factory that resolves the right agent
const multiAgentFactory = async (agentName: string, runConfig: RunConfig) => {
  switch (agentName) {
    case 'coordinator': return coordinator;
    case 'greeter': return greeterAgent;
    case 'task_executor': return taskAgent;
    default: return undefined;
  }
};
```

### Custom Flow Example

```typescript
import { BaseLlmFlow, ILlmRequestProcessor, ILlmResponseProcessor } from 'google-adk-nodejs';

class CustomFlow extends BaseLlmFlow {
  constructor() {
    super(
      [new BasicRequestProcessor(), new InstructionsRequestProcessor()], // Request processors
      [new FunctionResponseProcessor()], // Response processors
      'CustomFlow',
      'A custom flow with specific behavior'
    );
  }

  async runLlmInteraction(
    initialLlmRequest: LlmRequest,
    llm: IBaseLlm,
    context: InvocationContext
  ): Promise<Event> {
    // Custom interaction logic
    const processedRequest = await this.applyRequestProcessors(initialLlmRequest, context);
    const response = await llm.generateContentAsync(processedRequest);
    
    // Custom response handling
    const result = await this.applyResponseProcessors(response, processedRequest, context);
    
    return this.createEventFromLlmResponse(response, processedRequest, context);
  }
}

// Use custom flow
const customAgent = new LlmAgent({
  name: 'custom_agent',
  description: 'Agent with custom flow',
  flow: new CustomFlow()
});
```

### Event Handling and Monitoring

```typescript
async function runWithEventMonitoring() {
  const runConfig: RunConfig = {
    agentName: 'assistant',
    input: 'Explain quantum computing',
    userId: 'user123'
  };

  for await (const event of runner.runAgent(runConfig)) {
    switch (event.type) {
      case EventType.LLM_REQUEST:
        console.log('🤖 LLM Request:', event.llmRequest?.contents);
        break;
        
      case EventType.LLM_RESPONSE:
        console.log('💭 LLM Response:', event.llmResponse?.candidates?.[0]?.content);
        break;
        
      case EventType.TOOL_CALL:
        console.log('🔧 Tool Called:', event.functionCalls);
        break;
        
      case EventType.TOOL_RESULT:
        console.log('✅ Tool Result:', event.data);
        break;
        
      case EventType.ERROR:
        console.error('❌ Error:', event.data?.error);
        break;
        
      case EventType.MESSAGE:
        console.log('💬 Message:', event.data?.content);
        break;
    }
  }
}
```

## Key Design Patterns

### 1. **Event-Driven Architecture**
All interactions are modeled as events, enabling:
- Comprehensive logging and debugging
- Real-time monitoring
- Event replay and analysis
- Loose coupling between components

### 2. **Processor Pattern**
Request and response processors provide:
- Modular functionality
- Easy customization
- Reusable components
- Clear separation of concerns

### 3. **Factory Pattern**
Agent factories enable:
- Dynamic agent resolution
- Dependency injection
- Testing flexibility
- Runtime configuration

### 4. **Generator Pattern**
Async generators provide:
- Streaming event delivery
- Memory efficiency
- Real-time feedback
- Cancellation support

## Development and Testing

The codebase includes comprehensive testing with Jest:
- Unit tests for individual components
- Integration tests for full workflows
- Mock implementations for external dependencies
- Event flow validation

**Key Test Patterns:**
```typescript
// Event consumption helper
async function consumeRunnerOutput(
  generator: AsyncGenerator<Event, RunOutput, undefined>
): Promise<{ yieldedEvents: Event[], finalOutput: RunOutput }> {
  const yieldedEvents: Event[] = [];
  let result = await generator.next();
  while (!result.done) {
    if (result.value) { 
      yieldedEvents.push(result.value);
    }
    result = await generator.next();
  }
  return { yieldedEvents, finalOutput: result.value as RunOutput }; 
}
```

## Conclusion

The Node.js ADK provides a robust, flexible framework for building sophisticated AI agents. Its event-driven architecture, modular design, and comprehensive tooling make it suitable for everything from simple chatbots to complex multi-agent systems. The TypeScript implementation ensures type safety while maintaining the flexibility needed for diverse AI applications.

The framework's strength lies in its balance of structure and flexibility - providing sensible defaults while allowing deep customization at every level of the stack.

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
This project is a derivative work of https://github.com/google/adk-python
---

*Happy Agent Building!*
