import { GeminiLlm, GeminiLlmConfig } from '../GeminiLlm.js';
import { LlmRequest } from '../LlmRequest.js';
import { LlmResponse, Candidate as AdkCandidate } from '../LlmResponse.js';
import { 
    Content as AdkContent, 
    Part as AdkPart, 
    FunctionCall as AdkFunctionCall, 
    AdkHarmCategory, 
    AdkHarmProbability, 
    FinishReasonType as AdkFinishReasonType, 
    AdkSafetyRating,
    AdkJsonSchema,
    AdkJsonSchemaType,
    AdkHarmBlockThreshold,
} from '../LlmContent.js';
import {
    GoogleGenerativeAI,
    GenerateContentResponse,
    GenerateContentCandidate,
    Content as GoogleContent,
    Part as GooglePart,
    FunctionCallPart as GoogleFunctionCallPart,
    FinishReason as GoogleFinishReason,
    SafetyRating as GoogleSafetyRating,
    HarmCategory as GoogleHarmCategory,
    HarmProbability as GoogleHarmProbability,
    CitationMetadata as GoogleCitationMetadata,
    FunctionCall as GoogleSdkFunctionCall, // Renamed to avoid clash with AdkFunctionCall if used directly
} from '@google/generative-ai';

// Mock the entire @google/generative-ai library
const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();
const mockCountTokens = jest.fn();

const mockGetGenerativeModel = jest.fn(() => ({
    generateContent: mockGenerateContent,
    generateContentStream: mockGenerateContentStream,
    countTokens: mockCountTokens,
}));

jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel,
    })),
    // Export any enums or types needed for constructing mock SDK responses directly if the library doesn't export them or for clarity
    HarmCategory: {
        HARM_CATEGORY_UNSPECIFIED: 'HARM_CATEGORY_UNSPECIFIED',
        HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
        HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
        HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    },
    HarmProbability: {
        NEGLIGIBLE: 'NEGLIGIBLE',
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        HARM_PROBABILITY_UNSPECIFIED: 'HARM_PROBABILITY_UNSPECIFIED',
    },
    FinishReason: {
        FINISH_REASON_UNSPECIFIED: 'FINISH_REASON_UNSPECIFIED',
        STOP: 'STOP',
        MAX_TOKENS: 'MAX_TOKENS',
        SAFETY: 'SAFETY',
        RECITATION: 'RECITATION',
        OTHER: 'OTHER',
    },
}));

const TEST_API_KEY = 'test-api-key';

// Define a simplified type for mock stream chunks
interface MockSdkStreamChunk {
    text: () => string | undefined;
    functionCalls: () => GoogleSdkFunctionCall[] | undefined;
    // Add other properties/methods of EnhancedGenerateContentResponse if they become necessary for tests
}

describe('GeminiLlm', () => {
    let llm: GeminiLlm;
    const modelName = 'gemini-pro';
    const baseRequest: LlmRequest = {
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        requestId: 'test-req-1',
    };

    beforeEach(() => {
        // Clear all mock implementations and calls before each test
        mockGenerateContent.mockClear();
        mockGenerateContentStream.mockClear();
        mockCountTokens.mockClear();
        (GoogleGenerativeAI as jest.Mock).mockClear();

        // Create a new Llm instance for each test to ensure isolation
        llm = new GeminiLlm({ apiKey: TEST_API_KEY, modelName });
    });

    describe('constructor', () => {
        it('should initialize GoogleGenerativeAI with API key from config', () => {
            expect(GoogleGenerativeAI).toHaveBeenCalledWith(TEST_API_KEY);
        });

        it('should initialize GoogleGenerativeAI with API key from env if not in config', () => {
            process.env.GOOGLE_API_KEY = 'env-api-key';
            const localLlm = new GeminiLlm({ modelName });
            expect(GoogleGenerativeAI).toHaveBeenCalledWith('env-api-key');
            delete process.env.GOOGLE_API_KEY; // Clean up env var
        });

        it('should throw error if no API key is provided', () => {
            const oldApiKey = process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_API_KEY;
            expect(() => new GeminiLlm({ modelName })).toThrow(
                'GeminiLlm: API key is required either in config or as GOOGLE_API_KEY environment variable.'
            );
            if (oldApiKey) process.env.GOOGLE_API_KEY = oldApiKey; // Restore if it was set
        });
    });

    describe('generateContentAsync', () => {
        it('should call getGenerativeModel with correct model name and params', async () => {
            mockGenerateContent.mockResolvedValue({ response: { candidates: [] } }); // Minimal valid response
            await llm.generateContentAsync(baseRequest);
            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: modelName }));
        });

        // Test focusing on toAdkResponse transformation
        it('should correctly transform a Google SDK GenerateContentResponse to ADK LlmResponse', async () => {
            const mockGoogleCandidate = {
                index: 0,
                content: {
                    role: 'model',
                    parts: [{ text: 'Response text' }],
                },
                finishReason: GoogleFinishReason.STOP,
                safetyRatings: [
                    {
                        category: GoogleHarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        probability: GoogleHarmProbability.NEGLIGIBLE,
                    },
                ],
                tokenCount: 10,
                citationMetadata: { citationSources: [{ uri: 'test.com' }] },
            } as GenerateContentCandidate;
            
            const mockSdkResponse: GenerateContentResponse = {
                candidates: [mockGoogleCandidate],
                usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 },
            };
            mockGenerateContent.mockResolvedValue({ response: mockSdkResponse });

            const adkResponse = await llm.generateContentAsync(baseRequest);

            expect(adkResponse.model).toBe(modelName);
            expect(adkResponse.requestId).toBe(baseRequest.requestId);
            expect(adkResponse.candidates).toHaveLength(1);
            
            const adkCandidate = adkResponse.candidates[0];
            expect(adkCandidate.index).toBe(0);
            expect(adkCandidate.content.parts[0].text).toBe('Response text');
            expect(adkCandidate.finishReason).toBe('STOP');
            expect(adkCandidate.tokenCount).toBe(10);
            expect(adkCandidate.safetyRatings).toEqual([
                {
                    category: AdkHarmCategory.HATE_SPEECH,
                    probability: AdkHarmProbability.NEGLIGIBLE,
                    blocked: undefined, // as (sr as any).blocked would be undefined
                },
            ]);
            expect(adkCandidate.citationMetadata?.citationSources?.[0]?.uri).toBe('test.com');
            expect(adkResponse.usageMetadata?.totalTokenCount).toBe(15);
        });

        it('should infer TOOL_CALLS finishReason when functionCall parts are present', async () => {
            const mockGoogleFunctionCall: GoogleSdkFunctionCall = { name: 'testTool', args: { param: 'value' } };
            const mockGoogleCandidateWithToolCall: GenerateContentCandidate = {
                index: 0,
                content: {
                    role: 'model',
                    parts: [{ functionCall: mockGoogleFunctionCall }],
                },
                finishReason: GoogleFinishReason.STOP, // Google might return STOP even with tool calls
            };
            const mockSdkResponse: GenerateContentResponse = {
                candidates: [mockGoogleCandidateWithToolCall],
            };
            mockGenerateContent.mockResolvedValue({ response: mockSdkResponse });

            const adkResponse = await llm.generateContentAsync(baseRequest);
            const adkCandidate = adkResponse.candidates[0];

            expect(adkCandidate.finishReason).toBe('TOOL_CALLS');
            expect(adkCandidate.content.parts[0].functionCall).toEqual({ name: 'testTool', args: { param: 'value' } });
        });

        it('should handle errors from the SDK call', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console output
            const sdkError = new Error('SDK Error');
            (sdkError as any).status = 500; 
            mockGenerateContent.mockRejectedValue(sdkError);

            const adkResponse = await llm.generateContentAsync(baseRequest);

            expect(adkResponse.error).toBeDefined();
            expect(adkResponse.error?.code).toBe(500);
            expect(adkResponse.error?.message).toBe('SDK Error');
            expect(adkResponse.candidates).toEqual([]);
            (console.error as jest.Mock).mockRestore();
        });

        it('should correctly map AdkGenerationConfig to Google GenerationConfig', async () => {
            const adkGenConfig: LlmRequest['generationConfig'] = {
                candidateCount: 2,
                stopSequences: ['stop'],
                maxOutputTokens: 100,
                temperature: 0.7,
                topP: 0.9,
                topK: 40,
            };
            const requestWithGenConfig: LlmRequest = { ...baseRequest, generationConfig: adkGenConfig };
            mockGenerateContent.mockResolvedValue({ response: { candidates: [] } });
            
            await llm.generateContentAsync(requestWithGenConfig);

            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
                generationConfig: {
                    candidateCount: 2,
                    stopSequences: ['stop'],
                    maxOutputTokens: 100,
                    temperature: 0.7,
                    topP: 0.9,
                    topK: 40,
                }
            }));
        });

        it('should correctly map AdkSafetySettings to Google SafetySettings', async () => {
            const adkSafetySettings: LlmRequest['safetySettings'] = [
                { category: AdkHarmCategory.HATE_SPEECH, threshold: AdkHarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: AdkHarmCategory.DANGEROUS_CONTENT, threshold: AdkHarmBlockThreshold.BLOCK_ONLY_HIGH },
            ];
            const requestWithSafetySettings: LlmRequest = { ...baseRequest, safetySettings: adkSafetySettings };
            mockGenerateContent.mockResolvedValue({ response: { candidates: [] } });

            await llm.generateContentAsync(requestWithSafetySettings);

            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
                safetySettings: [
                    { category: GoogleHarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: GoogleHarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: 'BLOCK_ONLY_HIGH' },
                ]
            }));
        });

        it('should correctly map AdkTools to Google Tools with AdkJsonSchema', async () => {
            const adkTools: LlmRequest['tools'] = [
                {
                    functionDeclarations: [
                        {
                            name: 'get_weather',
                            description: 'Get weather forecast',
                            parameters: {
                                type: AdkJsonSchemaType.OBJECT,
                                properties: {
                                    location: { type: AdkJsonSchemaType.STRING, description: 'City and state' },
                                },
                                required: ['location'],
                            } as AdkJsonSchema,
                        },
                    ],
                },
            ];
            const requestWithTools: LlmRequest = { ...baseRequest, tools: adkTools };
            mockGenerateContent.mockResolvedValue({ response: { candidates: [] } });

            await llm.generateContentAsync(requestWithTools);
            
            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: 'get_weather',
                                description: 'Get weather forecast',
                                parameters: {
                                    type: 'OBJECT', // AdkJsonSchemaType.OBJECT is 'OBJECT'
                                    properties: {
                                        location: { type: 'STRING', description: 'City and state' },
                                    },
                                    required: ['location'],
                                },
                            },
                        ],
                    },
                ]
            }));
        });

        it('should correctly map systemInstruction to Google SystemInstruction', async () => {
            const adkSystemInstruction: AdkContent = {
                role: 'system', // Optional, defaults in mapping if not provided
                parts: [{ text: 'You are a helpful assistant.' }]
            };
            const requestWithSystemInstruction: LlmRequest = { ...baseRequest, systemInstruction: adkSystemInstruction };
            mockGenerateContent.mockResolvedValue({ response: { candidates: [] } });

            await llm.generateContentAsync(requestWithSystemInstruction);

            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: 'You are a helpful assistant.' }]
                }
            }));
        });

        // TODO: Add tests for generateContentStreamAsync
        // TODO: Add tests for countTokensAsync
    });

    describe('generateContentStreamAsync', () => {
        async function* createMockSdkStream(chunks: MockSdkStreamChunk[], finalResponse?: GenerateContentResponse) {
            for (const chunk of chunks) {
                yield chunk as any; // Cast to any to satisfy the SDK's stream type if it expects full EnhancedGenerateContentResponse
            }
        }

        it('should yield transformed ADK LlmResponse for each chunk from SDK stream', async () => {
            const mockChunk1: MockSdkStreamChunk = {
                text: () => 'Hello ',
                functionCalls: () => undefined, 
            };
            const mockChunk2: MockSdkStreamChunk = {
                text: () => 'world! ',
                functionCalls: () => undefined,
            };
            const mockFunctionCall: GoogleSdkFunctionCall = { name: 'toolA', args: { p: 1 } };
            const mockChunk3WithTool: MockSdkStreamChunk = {
                text: () => '',
                functionCalls: () => [mockFunctionCall],
            };

            mockGenerateContentStream.mockReturnValue({
                stream: createMockSdkStream([mockChunk1, mockChunk2, mockChunk3WithTool]),
                response: Promise.resolve({ candidates: [] }) 
            });

            const results: LlmResponse[] = [];
            for await (const res of llm.generateContentStreamAsync(baseRequest)) {
                results.push(res);
            }

            expect(results).toHaveLength(3);
            expect(results[0].candidates[0].content.parts[0].text).toBe('Hello ');
            expect(results[1].candidates[0].content.parts[0].text).toBe('world! ');
            expect(results[2].candidates[0].content.parts[0].functionCall?.name).toBe('toolA');
            expect(results[2].candidates[0].content.parts[0].functionCall?.args).toEqual({ p: 1 });
            // For streaming chunks, finishReason and safetyRatings are often not set per chunk in toAdkResponse
            // They are usually part of the aggregated response, which we aren't deeply testing here yet.
        });

        it('should call getGenerativeModel with correct params for streaming', async () => {
            mockGenerateContentStream.mockReturnValue({ stream: createMockSdkStream([]), response: Promise.resolve({ candidates: [] }) });
            awaitDrainStream(llm.generateContentStreamAsync(baseRequest)); // Consume the stream
            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: modelName }));
        });

        it('should handle errors from the SDK stream call and yield a single error response', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console output
            const sdkError = new Error('SDK Stream Error');
            mockGenerateContentStream.mockImplementation(() => {
                throw sdkError; // Error when generateContentStream is called
            });

            const yieldedResponses: LlmResponse[] = [];
            for await (const res of llm.generateContentStreamAsync(baseRequest)) {
                yieldedResponses.push(res);
            }
            
            expect(yieldedResponses).toHaveLength(1);
            const errorResponse = yieldedResponses[0];
            expect(errorResponse.error).toBeDefined();
            expect(errorResponse.error?.message).toBe('SDK Stream Error');
            expect(errorResponse.candidates).toEqual([]);
            (console.error as jest.Mock).mockRestore();
        });
    });

    // Helper function to drain an async iterator if we don't care about its values but need it to run
    async function awaitDrainStream(iterator: AsyncGenerator) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of iterator) { /* drain */ }
    }
        
    describe('countTokensAsync', () => {
        it('should call countTokens on the SDK model with correct contents and return totalTokens', async () => {
            const mockTokenCountResponse = { totalTokens: 123 };
            mockCountTokens.mockResolvedValue(mockTokenCountResponse);
            const request: LlmRequest = {
                model: modelName,
                contents: [{ role: 'user', parts: [{text: 'Count these tokens.'} ]}],
            };

            const totalTokens = await llm.countTokensAsync(request);

            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: modelName }));
            // Verify the structure passed to SDK's countTokens
            expect(mockCountTokens).toHaveBeenCalledWith(expect.objectContaining({
                contents: [{ role: 'user', parts: [{text: 'Count these tokens.'} ]}],
            }));
            expect(totalTokens).toBe(123);
        });

        it('should include systemInstruction if provided in the request for countTokens', async () => {
            const mockTokenCountResponse = { totalTokens: 150 };
            mockCountTokens.mockResolvedValue(mockTokenCountResponse);
            const requestWithSysInstruction: LlmRequest = {
                model: modelName,
                contents: [{ role: 'user', parts: [{text: 'Count these tokens.'} ]}],
                systemInstruction: { role: 'system', parts: [{text: 'You are a token counter.'} ]}
            };

            await llm.countTokensAsync(requestWithSysInstruction);

            expect(mockCountTokens).toHaveBeenCalledWith(expect.objectContaining({
                contents: [{ role: 'user', parts: [{text: 'Count these tokens.'} ]}],
                systemInstruction: { role: 'system', parts: [{text: 'You are a token counter.'} ]}
            }));
        });

        it('should throw an error if SDK countTokens call fails', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console output
            const sdkError = new Error('SDK countTokens Error');
            mockCountTokens.mockRejectedValue(sdkError);
            const request: LlmRequest = {
                model: modelName,
                contents: [{ role: 'user', parts: [{text: 'Count tokens failure test.'} ]}],
            };

            await expect(llm.countTokensAsync(request)).rejects.toThrow('SDK countTokens Error');
            (console.error as jest.Mock).mockRestore();
        });
    });
}); 