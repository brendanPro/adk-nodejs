import { BaseLlmFlow } from './BaseLlmFlow.js';
import { IBaseLlm, LlmRequest, LlmResponse, Content, FunctionCall, Part as AdkPart } from '../models/index.js';
import { InvocationContext } from '../common/InvocationContext.js';
import { Event, EventType } from '../common/Event.js';
import { IToolset } from '../tools/IToolset.js';
import { ILlmRegistry } from '../llm/ILlmRegistry.js';
import {
    InstructionsRequestProcessor,
    HistoryRequestProcessor,
    FunctionRequestProcessor,
    FunctionResponseProcessor
} from './processors/index.js';
import { ILlmRequestProcessor, ILlmResponseProcessor } from './FlowProcessor.js';

export interface AutoFlowConfig {
    maxInteractions?: number;
    historyMaxTurns?: number;
}

const DEFAULT_MAX_INTERACTIONS = 5;
const DEFAULT_HISTORY_MAX_TURNS = 10;

export class AutoFlow extends BaseLlmFlow {
    private autoConfig: Required<AutoFlowConfig>;

    constructor(config?: AutoFlowConfig, toolset?: IToolset, llmRegistry?: ILlmRegistry) {
        const mergedConfig: Required<AutoFlowConfig> = {
            maxInteractions: config?.maxInteractions === undefined ? DEFAULT_MAX_INTERACTIONS : config.maxInteractions,
            historyMaxTurns: config?.historyMaxTurns === undefined ? DEFAULT_HISTORY_MAX_TURNS : config.historyMaxTurns,
        };

        const requestProcessors: ILlmRequestProcessor[] = [
            new InstructionsRequestProcessor(),
            new HistoryRequestProcessor({ maxTurns: mergedConfig.historyMaxTurns }),
        ];
        if (toolset) {
            requestProcessors.push(new FunctionRequestProcessor(toolset));
        }

        const responseProcessors: ILlmResponseProcessor[] = [];
        if (toolset) {
            responseProcessors.push(new FunctionResponseProcessor(toolset));
        }

        super(requestProcessors, responseProcessors, 'AutoFlow', 'A flow that automatically handles multiple LLM turns and tool calls.', llmRegistry);
        this.autoConfig = mergedConfig;
    }

    async runLlmInteraction(
        initialRequest: LlmRequest,
        llm: IBaseLlm,
        context: InvocationContext
    ): Promise<Event> {
        let currentRequest = { ...initialRequest };
        let interactionCount = 0;
        let lastEvent: Event | undefined = undefined;

        while (interactionCount < this.autoConfig.maxInteractions) {
            interactionCount++;

            const processedRequest = await this.applyRequestProcessors(currentRequest, context);
            
            const llmRequestEvent: Event = {
                eventId: `${context.invocationId}-llmreq-${interactionCount}-${Date.now()}`,
                interactionId: context.invocationId, sessionId: context.session.id, userId: context.session.userId, appName: context.session.appName,
                type: EventType.LLM_REQUEST, source: { type: 'SYSTEM', name: this.name }, timestamp: new Date(),
                data: { message: `LLM Request for interaction ${interactionCount}` },
                llmRequest: processedRequest,
            };
            context.session.events.push(llmRequestEvent);

            const llmResponse = await llm.generateContentAsync(processedRequest);
            const processedResult = await this.applyResponseProcessors(llmResponse, processedRequest, context);
            
            if (processedResult && (processedResult as Event).eventId && (processedResult as Event).type) {
                lastEvent = processedResult as Event;
                context.session.events.push(lastEvent);

                if (lastEvent.type === EventType.TOOL_RESPONSE) { 
                    if (lastEvent.data?.content?.parts?.some(p => (p as AdkPart).functionResponse)) {
                        currentRequest = { ...this.createInitialLlmRequest(llm.modelNamePattern, context) };
                    } else {
                        break; 
                    }
                } else {
                    break; 
                }
            } else if (processedResult && !(processedResult as Event).eventId) {
                const finalLlmResponse = processedResult as LlmResponse;
                lastEvent = this.createEventFromLlmResponse(finalLlmResponse, processedRequest, context, EventType.LLM_RESPONSE);
                context.session.events.push(lastEvent);
                break; 
            } else {
                lastEvent = {
                    eventId: `${context.invocationId}-autoflow-procerror-${interactionCount}`,
                    interactionId: context.invocationId, sessionId: context.session.id, userId: context.session.userId, appName: context.session.appName,
                    type: EventType.ERROR, source: { type: 'SYSTEM', name: this.name }, timestamp: new Date(),
                    data: { error: { message: 'AutoFlow: Response processor returned an unexpected undefined or null value.' } }
                };
                context.session.events.push(lastEvent);
                break; 
            }

            if (interactionCount >= this.autoConfig.maxInteractions) {
                if (lastEvent) { 
                    lastEvent = {
                        ...lastEvent,
                        actions: {
                            ...(lastEvent.actions || {}),
                            flowTerminationReason: 'MAX_INTERACTIONS'
                        }
                    };
                }
                break; 
            }
        }

        if (!lastEvent) {
            return {
                eventId: `${context.invocationId}-autoflow-noevent-${Date.now()}`,
                interactionId: context.invocationId, sessionId: context.session.id, userId: context.session.userId, appName: context.session.appName,
                type: EventType.ERROR, source: { type: 'SYSTEM', name: this.name }, timestamp: new Date(),
                data: { error: { message: 'AutoFlow completed without producing a final event after interactions.' } }
            };
        }
        return lastEvent; 
    }
} 