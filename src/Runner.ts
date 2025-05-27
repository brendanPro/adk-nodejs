import { IRunner } from './IRunner.js';
import { ISessionService } from './services/ISessionService.js';
import { IArtifactService } from './services/IArtifactService.js';
import { IMemoryService } from './services/IMemoryService.js';
import { IAgent } from './agents/IAgent.js';
import { InvocationContext } from './common/InvocationContext.js';
import { RunConfig, RunOutput } from './common/RunConfig.js';
import { Session } from './common/Session.js';
import { Event, EventType, EventSourceType } from './common/Event.js';
import { ILlmRegistry } from './llm/ILlmRegistry.js';
import { LlmRegistry } from './llm/LlmRegistry.js';
import { ICodeExecutor } from './services/ICodeExecutor.js';
import { Content } from './models/LlmContent.js';
import { v4 as uuidv4 } from 'uuid';

// Placeholder for agent resolution - this will need to be fleshed out
// For now, we might assume an agent instance is passed in or resolved very simply.
export type AgentFactory = (agentName: string, runConfig: RunConfig, invocationContext: InvocationContext) => Promise<IAgent | undefined>;

export class Runner implements IRunner {
    private sessionService: ISessionService;
    private artifactService: IArtifactService;
    private memoryService: IMemoryService; 
    private agentFactory: AgentFactory; 
    private llmRegistry: ILlmRegistry;
    private codeExecutor?: ICodeExecutor;
    private defaultAppName: string;

    constructor(
        sessionService: ISessionService,
        artifactService: IArtifactService,
        memoryService: IMemoryService,
        agentFactory: AgentFactory,
        llmRegistry?: ILlmRegistry,
        codeExecutor?: ICodeExecutor,
        defaultAppName: string = 'default-adk-app'
    ) {
        this.sessionService = sessionService;
        this.artifactService = artifactService;
        this.memoryService = memoryService;
        this.agentFactory = agentFactory;
        this.llmRegistry = llmRegistry || new LlmRegistry();
        this.codeExecutor = codeExecutor;
        this.defaultAppName = defaultAppName;
    }

    public async *runAgent(runConfig: RunConfig): AsyncGenerator<Event, RunOutput, undefined> {
        const runId = runConfig.runId || uuidv4();
        let session: Session;
        const appName = runConfig.appName || this.defaultAppName;
        const allYieldedEvents: Event[] = [];

        const persistAndTrackEvent = async (event: Event, sessionIdForHistory?: string) => {
            allYieldedEvents.push(event);
            if (sessionIdForHistory && this.sessionService) {
                 try {
                    await this.sessionService.appendEvent(sessionIdForHistory, event);
                } catch (e) {
                    // console.error(`Runner: Failed to append event ${event.eventId} to session ${sessionIdForHistory}`, e);
                }
            }
        };

        try {
            if (runConfig.sessionId) {
                const existingSession = await this.sessionService.getSession(runConfig.sessionId);
                if (!existingSession) {
                    session = await this.sessionService.createSession(runConfig.userId || 'anonymous', appName);
                    const sessionNotFoundEvent = this.createRunnerEvent(runId, session.id, session.userId, session.appName, EventType.SESSION_CREATE, { message: `Specified session ${runConfig.sessionId} not found. New session ${session.id} created.`}, runConfig);
                    await persistAndTrackEvent(sessionNotFoundEvent, session.id);
                    yield sessionNotFoundEvent;
                } else {
                    session = existingSession;
                }
            } else {
                session = await this.sessionService.createSession(runConfig.userId || 'anonymous', appName);
                const sessionCreateEvent = this.createRunnerEvent(runId, session.id, session.userId, session.appName, EventType.SESSION_CREATE, { message: `New session ${session.id} created for run.`}, runConfig);
                await persistAndTrackEvent(sessionCreateEvent, session.id);
                yield sessionCreateEvent;
            }
            runConfig.sessionId = session.id;
            runConfig.appName = appName;

            const runStartEvent = this.createRunnerEvent(runId, session.id, session.userId, session.appName, EventType.RUN_START, { message: `Run ${runId} starting.`, input: runConfig.input }, runConfig);
            await persistAndTrackEvent(runStartEvent, session.id);
            yield runStartEvent;

            // Convert user input to a user message event and append to session
            if (runConfig.input) {
                await this.appendUserInputToSession(runId, session, runConfig.input, runConfig);
            }

            const initialInvocationContext = this.createInitialInvocationContext(runId, session, runConfig);
            const agent = await this.agentFactory(runConfig.agentName, runConfig, initialInvocationContext);
            if (!agent) {
                throw new Error(`Agent with name '${runConfig.agentName}' not found or could not be initialized.`);
            }
            initialInvocationContext.agent = agent; 

            let agentReturnEvent: Event | void = undefined;
            const agentGenerator = agent.runAsync(initialInvocationContext); 
            let agentResult = await agentGenerator.next();
            while(!agentResult.done) {
                const eventFromAgent = agentResult.value;
                if (eventFromAgent) {
                    const eventToYield = { ...eventFromAgent, sessionId: session.id };
                    // Agent responsible for adding to its session.events. Runner tracks for RunOutput.events and appends for history.
                    // We re-append here with Runner context to ensure it's in history if agent didn't use sessionService directly.
                    await persistAndTrackEvent(eventToYield, session.id); 
                    yield eventToYield; 
                }
                agentResult = await agentGenerator.next();
            }
            agentReturnEvent = agentResult.value;

            if (agentReturnEvent && !allYieldedEvents.find(e => e.eventId === agentReturnEvent!.eventId)) {
                await persistAndTrackEvent(agentReturnEvent, session.id);
                yield agentReturnEvent;
            }
            
            // Final session state update, includes all events accumulated in initialInvocationContext.session.events
            // by the agent and its flows.
            await this.sessionService.updateSessionState(session.id, initialInvocationContext.session.state, initialInvocationContext.session.events);

            const finalOutputData = agentReturnEvent?.data || (allYieldedEvents.length > 0 ? (allYieldedEvents[allYieldedEvents.length-1] as Event)?.data : undefined);
            const runCompleteEvent = this.createRunnerEvent(runId, session.id, session.userId, session.appName, EventType.RUN_COMPLETE, { message: `Run ${runId} completed successfully.`, output: finalOutputData }, runConfig);
            await persistAndTrackEvent(runCompleteEvent, session.id);
            yield runCompleteEvent;
            
            return {
                runId: runId,
                sessionId: session.id,
                finalState: initialInvocationContext.session.state, 
                output: finalOutputData,
                error: undefined,
                events: [...allYieldedEvents],
            };

        } catch (error: any) {
            const errorMessage = error.message || 'Unknown error during agent run.';
            const errorDetails = error.stack || undefined;
            const errorCode = error.code || undefined;

            const errorEvent = this.createRunnerEvent(runId, runConfig.sessionId || 'unknown-session', runConfig.userId, appName, EventType.ERROR, { error: { message: errorMessage, details: errorDetails, code: errorCode }, originalError: error }, runConfig);
            // Persist and track, then yield
            allYieldedEvents.push(errorEvent); // Add to collection first, even if session append fails
            if(runConfig.sessionId) { 
                try {
                    await this.sessionService.appendEvent(runConfig.sessionId, errorEvent);
                } catch (sessionError: any) {
                    // console.error(...)
                }
            }
            yield errorEvent; // Yield the error event
            
            return {
                runId: runId,
                sessionId: runConfig.sessionId,
                output: undefined,
                error: { message: errorMessage, details: errorDetails, code: errorCode },
                events: allYieldedEvents, 
            };
        }
    }

    private createInitialInvocationContext(runId: string, session: Session, runConfig: RunConfig): InvocationContext {
        return {
            invocationId: runConfig.interactionId || runId, 
            agent: undefined as any, 
            session: session, 
            runConfig: runConfig,
            services: {
                sessionService: this.sessionService,
                artifactService: this.artifactService,
                memoryService: this.memoryService,
                llmRegistry: this.llmRegistry,
                codeExecutor: this.codeExecutor,
            }
        };
    }

    private createRunnerEvent(runId: string, sessionId: string, userId: string | undefined, appNameFromSessionOrConfig: string | undefined, type: EventType, data: any, runConfig?: RunConfig): Event {
        const interactionId = runConfig?.interactionId || runId;
        return {
            eventId: `${runId}-runner-${type.toLowerCase().replace(/_/g, '-')}-${uuidv4()}`,
            interactionId: interactionId, 
            sessionId: sessionId,
            userId: userId,
            appName: appNameFromSessionOrConfig || this.defaultAppName,
            type: type,
            source: { type: 'RUNNER', name: 'Runner' },
            timestamp: new Date(),
            data: data,
        };
    }

    /**
     * Converts user input to a user message event and appends it to the session.
     * This is similar to the Python _append_new_message_to_session method.
     */
    private async appendUserInputToSession(runId: string, session: Session, input: Content | string, runConfig: RunConfig): Promise<void> {
        // Convert string input to Content format
        const content: Content = typeof input === 'string' 
            ? { parts: [{ text: input }], role: 'user' }
            : { ...input, role: 'user' }; // Ensure role is set to 'user'

        const interactionId = runConfig.interactionId || runId;
        
        // Create a user message event
        const userMessageEvent: Event = {
            eventId: `${runId}-user-message-${uuidv4()}`,
            interactionId: interactionId,
            sessionId: session.id,
            userId: session.userId,
            appName: session.appName,
            type: EventType.MESSAGE,
            source: { type: 'USER', name: 'user' },
            timestamp: new Date(),
            data: { content: content },
        };

        // Append the event to the session's events array
        session.events.push(userMessageEvent);

        // Note: We don't call sessionService.appendEvent here because the Runner
        // will handle persistence of all events through its persistAndTrackEvent mechanism
    }

    // Removed addEventToHistoryAndOutput, logic integrated into boundYieldAndStore or direct calls
} 