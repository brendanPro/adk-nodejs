# Agents

The Agent Development Kit (ADK) for Node.js provides a flexible and modular framework for developing AI agents. This guide covers the core concepts, architecture, and best practices for building agents using TypeScript.

## Table of Contents

- [Overview](#overview)
- [Agent Architecture](#agent-architecture)
- [Agent Types](#agent-types)
- [Multi-Agent Systems](#multi-agent-systems)
- [Flows and Processors](#flows-and-processors)
- [Tools Integration](#tools-integration)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

Agents in ADK are autonomous entities that can interact with Large Language Models (LLMs), execute tools, and coordinate with other agents to accomplish complex tasks. The framework is designed to be:

- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Modular**: Composable architecture with clear separation of concerns
- **Extensible**: Easy to customize and extend for specific use cases
- **Event-driven**: Streaming architecture with real-time event processing

## Agent Architecture

### Core Interfaces

The agent system is built around several key interfaces:

#### `IAgent`

The base interface that all agents must implement:

```typescript
interface IAgent {
  name: string;                    // Unique identifier within agent tree
  description: string;             // Capability description for LLM delegation
  llmConfig?: LlmAgentConfig;     // LLM-specific configurations
  toolset?: IToolset;             // Available tools for this agent
  parentAgent?: IAgent;           // Parent in hierarchical structure
  subAgents: IAgent[];            // Child agents
  beforeAgentCallback?: BeforeAgentCallback | BeforeAgentCallback[];
  afterAgentCallback?: AfterAgentCallback | AfterAgentCallback[];
  
  // Core execution method
  runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined>;
  
  // Agent discovery methods
  findAgent(name: string): IAgent | undefined;
  getRootAgent(): IAgent;
}
```

#### `BaseAgent`

Abstract base class providing common functionality:

```typescript
abstract class BaseAgent implements IAgent {
  protected abstract flow?: IBaseLlmFlow;
  
  // Manages agent hierarchy
  protected addSubAgent(subAgent: IAgent): void;
  
  // Creates execution context
  protected createInvocationContext(
    parentContext: InvocationContext | null, 
    session: Session, 
    runConfig?: RunConfig
  ): InvocationContext;
  
  // Must be implemented by concrete agents
  protected abstract getInitialLlmRequest(context: InvocationContext): LlmRequest;
}
```

## Agent Types

### LLM Agent

The primary agent type that interacts with Large Language Models:

```typescript
interface LlmAgentProps {
  name: string;
  description: string;
  llmConfig?: LlmAgentConfig;
  toolset?: IToolset;
  flow?: IBaseLlmFlow;              // Defaults to SingleFlow
  subAgents?: IAgent[];
  beforeAgentCallback?: BeforeAgentCallback | BeforeAgentCallback[];
  afterAgentCallback?: AfterAgentCallback | AfterAgentCallback[];
}

class LlmAgent extends BaseAgent {
  constructor(props: LlmAgentProps) {
    super(props);
    this.flow = props.flow || new SingleFlow();
  }
}
```

#### Creating an LLM Agent

```typescript
import { LlmAgent, LlmAgentConfig, BaseToolset, FunctionTool } from 'adk-nodejs';

// Configure the agent
const agentConfig: LlmAgentConfig = {
  modelName: 'gemini-1.5-pro',
  systemInstruction: 'You are a helpful assistant specialized in data analysis.',
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 1000
  },
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    }
  ]
};

// Create toolset
const toolset = new BaseToolset({
  name: 'AnalysisTools',
  tools: [
    new FunctionTool({
      name: 'calculate_statistics',
      description: 'Calculate basic statistics for a dataset',
      parametersSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'number' } },
          metrics: { type: 'array', items: { type: 'string' } }
        },
        required: ['data']
      },
      func: async (args, context) => {
        const { data, metrics = ['mean', 'median'] } = args;
        // Implementation here
        return `Statistics calculated for ${data.length} data points`;
      }
    })
  ]
});

// Create the agent
const dataAnalyst = new LlmAgent({
  name: 'DataAnalyst',
  description: 'Analyzes data and provides statistical insights',
  llmConfig: agentConfig,
  toolset: toolset
});
```

### Custom Agents

You can create custom agent types by extending `BaseAgent`:

```typescript
class WorkflowAgent extends BaseAgent {
  private steps: WorkflowStep[];
  
  constructor(props: WorkflowAgentProps) {
    super(props);
    this.steps = props.steps;
  }
  
  protected getInitialLlmRequest(context: InvocationContext): LlmRequest {
    // Custom implementation for workflow-specific requests
    return {
      model: this.llmConfig?.modelName || 'default-model',
      contents: [
        {
          role: 'user',
          parts: [{ text: `Execute workflow: ${this.steps.map(s => s.name).join(' -> ')}` }]
        }
      ]
    };
  }
  
  async *runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined> {
    // Custom workflow execution logic
    for (const step of this.steps) {
      yield* this.executeStep(step, context);
    }
  }
}
```

## Multi-Agent Systems

ADK supports hierarchical multi-agent architectures where agents can delegate tasks to specialized sub-agents.

### Agent Hierarchy

```typescript
// Create specialized agents
const codeReviewer = new LlmAgent({
  name: 'CodeReviewer',
  description: 'Reviews code for quality, security, and best practices',
  llmConfig: { modelName: 'gemini-1.5-pro' }
});

const documentationWriter = new LlmAgent({
  name: 'DocumentationWriter', 
  description: 'Writes comprehensive technical documentation',
  llmConfig: { modelName: 'gemini-1.5-flash' }
});

const testGenerator = new LlmAgent({
  name: 'TestGenerator',
  description: 'Generates unit and integration tests',
  llmConfig: { modelName: 'gemini-1.5-pro' }
});

// Create supervisor agent
const developmentSupervisor = new LlmAgent({
  name: 'DevelopmentSupervisor',
  description: 'Coordinates development tasks across specialized agents',
  subAgents: [codeReviewer, documentationWriter, testGenerator],
  llmConfig: {
    modelName: 'gemini-1.5-pro',
    systemInstruction: `You coordinate development tasks. Available agents:
    - CodeReviewer: for code quality analysis
    - DocumentationWriter: for creating documentation  
    - TestGenerator: for creating tests
    
    Delegate tasks appropriately using agent transfer.`
  }
});
```

### Agent Transfer

Agents can transfer control to other agents using the transfer mechanism:

```typescript
// In a callback or tool
context.requestAgentTransfer('CodeReviewer');

// Or through LLM response actions
const transferEvent: Event = {
  // ... event properties
  actions: { 
    transferToAgent: 'DocumentationWriter' 
  }
};
```

The transfer process:

1. Current agent yields an `AGENT_TRANSFER` event
2. Runner handles the transfer to the target agent
3. Target agent receives the context and continues execution
4. Control can return to the original agent or terminate

## Flows and Processors

Flows define how agents interact with LLMs, while processors handle request/response transformations.

### Flow Types

#### SingleFlow

Handles a single request-response cycle with tool support:

```typescript
import { SingleFlow } from 'adk-nodejs';

const singleFlow = new SingleFlow();
const agent = new LlmAgent({
  name: 'SimpleAgent',
  description: 'Handles single interactions',
  flow: singleFlow
});
```

#### AutoFlow

Manages multiple LLM turns automatically with conversation history:

```typescript
import { AutoFlow } from 'adk-nodejs';

const autoFlow = new AutoFlow({
  maxInteractions: 10,
  historyMaxTurns: 20
}, toolset);

const conversationalAgent = new LlmAgent({
  name: 'ConversationalAgent',
  description: 'Handles multi-turn conversations',
  flow: autoFlow
});
```

### Custom Flows

Create custom flows by extending `BaseLlmFlow`:

```typescript
class CustomFlow extends BaseLlmFlow {
  constructor() {
    super(
      [new CustomRequestProcessor()],    // Request processors
      [new CustomResponseProcessor()],   // Response processors
      'CustomFlow',
      'A specialized flow for custom logic'
    );
  }
  
  async runLlmInteraction(
    request: LlmRequest,
    llm: IBaseLlm,
    context: InvocationContext
  ): Promise<Event> {
    // Custom interaction logic
    const processedRequest = await this.applyRequestProcessors(request, context);
    const response = await llm.generateContentAsync(processedRequest);
    const result = await this.applyResponseProcessors(response, processedRequest, context);
    
    return this.createEventFromLlmResponse(response, processedRequest, context);
  }
}
```

### Processors

Processors transform requests and responses:

```typescript
// Custom request processor
class CustomRequestProcessor implements ILlmRequestProcessor {
  async processRequest(
    request: LlmRequest,
    context: InvocationContext
  ): Promise<LlmRequest | void> {
    // Add custom headers, modify content, etc.
    request.systemInstruction = `${request.systemInstruction}\nCustom instructions here.`;
    return request;
  }
}

// Custom response processor  
class CustomResponseProcessor implements ILlmResponseProcessor {
  async processResponse(
    response: LlmResponse,
    request: LlmRequest,
    context: InvocationContext
  ): Promise<LlmResponse | Event | void> {
    // Process function calls, modify response, etc.
    if (this.shouldCreateCustomEvent(response)) {
      return this.createCustomEvent(response, context);
    }
    return response;
  }
}
```

## Tools Integration

Agents can use tools to extend their capabilities beyond text generation.

### Creating Tools

```typescript
import { FunctionTool, BaseToolset } from 'adk-nodejs';

// Simple function tool
const weatherTool = new FunctionTool({
  name: 'get_weather',
  description: 'Get current weather for a location',
  parametersSchema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
      units: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' }
    },
    required: ['location']
  },
  func: async (args, context) => {
    const { location, units = 'celsius' } = args;
    // Call weather API
    return `Current weather in ${location}: 22°${units === 'celsius' ? 'C' : 'F'}`;
  }
});

// Create toolset
const weatherToolset = new BaseToolset({
  name: 'WeatherTools',
  tools: [weatherTool]
});
```

### Advanced Tools

```typescript
class DatabaseTool extends BaseTool {
  private connection: DatabaseConnection;
  
  constructor(connection: DatabaseConnection) {
    super({
      name: 'query_database',
      description: 'Execute SQL queries on the database',
      parametersSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SQL query to execute' },
          limit: { type: 'number', default: 100 }
        },
        required: ['query']
      }
    });
    this.connection = connection;
  }
  
  async execute(args: Record<string, any>, context: ToolContext): Promise<Content> {
    const { query, limit = 100 } = args;
    
    // Validate query safety
    if (!this.isQuerySafe(query)) {
      throw new Error('Unsafe query detected');
    }
    
    const results = await this.connection.query(query, { limit });
    
    return {
      parts: [
        { text: `Query executed successfully. ${results.length} rows returned.` },
        { text: JSON.stringify(results, null, 2) }
      ]
    };
  }
  
  private isQuerySafe(query: string): boolean {
    // Implement query validation logic
    const dangerousPatterns = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\b/i;
    return !dangerousPatterns.test(query);
  }
}
```

### Tool Callbacks

Tools support lifecycle callbacks:

```typescript
const auditedTool = new FunctionTool({
  name: 'sensitive_operation',
  description: 'Performs a sensitive operation with auditing',
  beforeExecution: [
    async (context, args) => {
      console.log(`User ${context.invocationContext.session.userId} executing sensitive operation`);
      // Log to audit system
    }
  ],
  afterExecution: [
    async (context, result) => {
      console.log('Sensitive operation completed');
      // Update audit log with results
    }
  ],
  func: async (args, context) => {
    // Sensitive operation implementation
    return 'Operation completed successfully';
  }
});
```

## Configuration

### LLM Configuration

```typescript
interface LlmAgentConfig {
  instructions?: string | Content;     // System instructions
  modelName?: string;                  // Model identifier
  generationConfig?: GenerationConfig; // Generation parameters
  safetySettings?: SafetySetting[];    // Safety configurations
  tools?: Tool[];                      // Additional tools
  toolConfig?: {                       // Tool calling configuration
    functionCallingConfig?: {
      mode: 'ANY' | 'AUTO' | 'NONE';
      allowedFunctionNames?: string[];
    }
  };
}
```

### Runtime Configuration

```typescript
interface RunConfig {
  agentName: string;                   // Target agent name
  input: Content | string;             // User input
  sessionId?: string;                  // Existing session ID
  userId?: string;                     // User identifier
  appName?: string;                    // Application name
  runId?: string;                      // Unique run identifier
  interactionId?: string;              // Interaction identifier
  defaultModelName?: string;           // Fallback model
  maxTurns?: number;                   // Conversation limit
  // Additional configuration options
}
```

## Best Practices

### 1. Type Safety

Always use TypeScript interfaces and maintain strict typing:

```typescript
// Good: Strongly typed agent props
interface CustomAgentProps extends LlmAgentProps {
  customConfig: CustomConfiguration;
  validators: ValidationFunction[];
}

// Good: Type-safe tool parameters
interface WeatherParams {
  location: string;
  units: 'celsius' | 'fahrenheit';
}

const weatherTool = new FunctionTool({
  name: 'get_weather',
  func: async (args: WeatherParams, context: ToolContext) => {
    // Type-safe implementation
  }
});
```

### 2. Error Handling

Implement comprehensive error handling:

```typescript
class RobustAgent extends BaseAgent {
  async *runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined> {
    try {
      yield* super.runAsync(context);
    } catch (error) {
      const errorEvent = this.createErrorEvent(error, context);
      yield errorEvent;
      
      // Log error for debugging
      console.error(`Agent ${this.name} error:`, error);
      
      // Optionally attempt recovery
      if (this.canRecover(error)) {
        yield* this.attemptRecovery(context);
      }
      
      return errorEvent;
    }
  }
}
```

### 3. Resource Management

Properly manage resources and cleanup:

```typescript
class ResourceManagedAgent extends BaseAgent {
  private resources: Resource[] = [];
  
  async *runAsync(context: InvocationContext): AsyncGenerator<Event, Event | void, undefined> {
    try {
      await this.initializeResources();
      yield* super.runAsync(context);
    } finally {
      await this.cleanupResources();
    }
  }
  
  private async cleanupResources(): Promise<void> {
    await Promise.all(this.resources.map(r => r.dispose()));
    this.resources = [];
  }
}
```

### 4. Testing

Write comprehensive tests for agents:

```typescript
describe('WeatherAgent', () => {
  let agent: LlmAgent;
  let mockToolset: jest.Mocked<IToolset>;
  let mockContext: InvocationContext;
  
  beforeEach(() => {
    mockToolset = createMockToolset();
    agent = new LlmAgent({
      name: 'WeatherAgent',
      description: 'Provides weather information',
      toolset: mockToolset
    });
    mockContext = createMockContext();
  });
  
  it('should handle weather requests correctly', async () => {
    mockToolset.executeTool.mockResolvedValue('Sunny, 25°C');
    
    const generator = agent.runAsync(mockContext);
    const events: Event[] = [];
    
    for await (const event of generator) {
      events.push(event);
    }
    
    expect(events).toHaveLength(3); // Start, response, end
    expect(events[1].type).toBe(EventType.LLM_RESPONSE);
  });
});
```

### 5. Performance Optimization

Optimize for performance and scalability:

```typescript
// Use connection pooling for database tools
class OptimizedDatabaseTool extends BaseTool {
  private static connectionPool = new ConnectionPool();
  
  async execute(args: any, context: ToolContext): Promise<Content> {
    const connection = await OptimizedDatabaseTool.connectionPool.acquire();
    try {
      return await this.executeQuery(args.query, connection);
    } finally {
      OptimizedDatabaseTool.connectionPool.release(connection);
    }
  }
}

// Cache expensive computations
class CachedAgent extends LlmAgent {
  private cache = new Map<string, any>();
  
  protected async computeExpensiveOperation(input: string): Promise<any> {
    if (this.cache.has(input)) {
      return this.cache.get(input);
    }
    
    const result = await this.performComputation(input);
    this.cache.set(input, result);
    return result;
  }
}
```

## Examples

### Basic Chat Agent

```typescript
import { LlmAgent, Runner, InMemorySessionService } from 'adk-nodejs';

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

const runner = new Runner(
  new InMemorySessionService(),
  new InMemoryArtifactService(),
  new InMemoryMemoryService(),
  async (agentName) => chatAgent
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

### Multi-Agent Workflow

```typescript
// Create specialized agents
const researchAgent = new LlmAgent({
  name: 'Researcher',
  description: 'Conducts research and gathers information',
  toolset: createResearchToolset()
});

const writerAgent = new LlmAgent({
  name: 'Writer', 
  description: 'Creates well-structured written content',
  toolset: createWritingToolset()
});

const editorAgent = new LlmAgent({
  name: 'Editor',
  description: 'Reviews and improves written content',
  toolset: createEditingToolset()
});

// Create coordinator
const coordinator = new LlmAgent({
  name: 'ContentCoordinator',
  description: 'Coordinates content creation workflow',
  subAgents: [researchAgent, writerAgent, editorAgent],
  llmConfig: {
    systemInstruction: `You coordinate content creation:
    1. Use Researcher for gathering information
    2. Use Writer for creating initial drafts  
    3. Use Editor for final review and polish
    
    Transfer between agents as needed to complete the workflow.`
  }
});

// Execute workflow
const workflowConfig = {
  agentName: 'ContentCoordinator',
  input: 'Create a comprehensive article about renewable energy trends',
  userId: 'content-team'
};

for await (const event of runner.runAgent(workflowConfig)) {
  if (event.type === EventType.AGENT_TRANSFER) {
    console.log(`Transferring to: ${event.actions?.transferToAgent}`);
  }
}
```

This comprehensive guide covers the essential concepts and patterns for building agents with the ADK Node.js framework. The modular architecture, strong typing, and event-driven design enable you to create sophisticated AI applications that can scale from simple chatbots to complex multi-agent systems.
