import {
  GoogleGenerativeAI,
  HarmCategory as GoogleHarmCategory,
  HarmBlockThreshold as GoogleHarmBlockThreshold,
  GenerateContentRequest,
  GenerationConfig,
  SafetySetting as GoogleSafetySetting,
  Content as GoogleContent,
  Part as GooglePart,
  FunctionCall as GoogleFunctionCall,
  FunctionResponse as GoogleFunctionResponse,
  Tool as GoogleTool,
  FunctionDeclaration as GoogleFunctionDeclaration,
  GenerateContentResponse,
  GenerateContentCandidate as GoogleCandidate,
  EnhancedGenerateContentResponse,
  FinishReason as GoogleFinishReason,
  SafetyRating as GoogleSafetyRating,
  HarmProbability as GoogleHarmProbability,
} from '@google/generative-ai';
import { IBaseLlm } from './IBaseLlm.js';
import { LlmRequest, GenerationConfig as AdkGenerationConfig } from './LlmRequest.js';
import { LlmResponse, Candidate as AdkCandidate, LlmError } from './LlmResponse.js';
import { 
    Content as AdkContent, 
    FunctionCall as AdkFunctionCall, 
    Part as AdkPart, 
    Tool as AdkTool, 
    SafetySetting as AdkSafetySetting,
    AdkHarmCategory, 
    AdkHarmBlockThreshold, 
    AdkHarmProbability, 
    AdkSafetyRating,
    FunctionDeclaration as AdkFunctionDeclaration,
    AdkJsonSchema,
    GenerationInfo as AdkGenerationInfo,
    FinishReasonType as AdkFinishReasonType
} from './LlmContent.js';

// Helper to convert ADK Content to Google Content
function toGoogleContent(adkContents: AdkContent[]): GoogleContent[] {
  return adkContents.map((c: AdkContent) => ({
    role: c.role || (c.parts.some(p => p.functionResponse) ? 'function' : 'user'),
    parts: c.parts.map((p: AdkPart) => {
      if (p.text) return { text: p.text };
      if (p.functionCall) return { functionCall: p.functionCall as GoogleFunctionCall }; 
      if (p.functionResponse) return { functionResponse: p.functionResponse as GoogleFunctionResponse };
      return { text: '' };
    }),
  }));
}

// Helper to convert Google HarmCategory to AdkHarmCategory
function toAdkHarmCategory(googleCategory?: GoogleHarmCategory): AdkHarmCategory {
    switch (googleCategory) {
        case GoogleHarmCategory.HARM_CATEGORY_HARASSMENT: return AdkHarmCategory.HARASSMENT;
        case GoogleHarmCategory.HARM_CATEGORY_HATE_SPEECH: return AdkHarmCategory.HATE_SPEECH;
        case GoogleHarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: return AdkHarmCategory.SEXUALLY_EXPLICIT;
        case GoogleHarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: return AdkHarmCategory.DANGEROUS_CONTENT;
        default: return AdkHarmCategory.UNSPECIFIED;
    }
}

// Helper to convert Google HarmProbability to AdkHarmProbability
function toAdkHarmProbability(googleProbability?: GoogleHarmProbability): AdkHarmProbability {
    switch (googleProbability) {
        case GoogleHarmProbability.NEGLIGIBLE: return AdkHarmProbability.NEGLIGIBLE;
        case GoogleHarmProbability.LOW: return AdkHarmProbability.LOW;
        case GoogleHarmProbability.MEDIUM: return AdkHarmProbability.MEDIUM;
        case GoogleHarmProbability.HIGH: return AdkHarmProbability.HIGH;
        default: return AdkHarmProbability.UNSPECIFIED;
    }
}

// Helper to convert Google GenerateContentResponse to ADK LlmResponse
function toAdkResponse(responseUnion: GenerateContentResponse | EnhancedGenerateContentResponse, model: string, requestId?: string): LlmResponse {
  let adkCandidates: AdkCandidate[] = [];
  let usageMetadata: any = undefined; 

  if ('candidates' in responseUnion) {
    const fullResponse = responseUnion as GenerateContentResponse;
    if (fullResponse.candidates) {
        adkCandidates = fullResponse.candidates.map((candidate: GoogleCandidate) => {
          const adkParts: AdkPart[] = candidate.content?.parts.map((part: GooglePart) => {
            const adkPart: AdkPart = {};
            if (part.text !== undefined) adkPart.text = part.text;
            if (part.functionCall) {
                adkPart.functionCall = { name: part.functionCall.name, args: part.functionCall.args || {} };
            }
            return adkPart;
          }) || [];

          let adkFinishReason: AdkFinishReasonType | undefined = undefined;
          const hasFunctionCall = adkParts.some(p => p.functionCall);

          if (hasFunctionCall) {
              adkFinishReason = 'TOOL_CALLS';
          } else if (candidate.finishReason) {
              switch (candidate.finishReason) {
                  case GoogleFinishReason.STOP: adkFinishReason = 'STOP'; break;
                  case GoogleFinishReason.MAX_TOKENS: adkFinishReason = 'MAX_TOKENS'; break;
                  case GoogleFinishReason.SAFETY: adkFinishReason = 'SAFETY'; break;
                  case GoogleFinishReason.RECITATION: adkFinishReason = 'RECITATION'; break;
                  case GoogleFinishReason.OTHER: adkFinishReason = 'OTHER'; break;
                  case GoogleFinishReason.FINISH_REASON_UNSPECIFIED: adkFinishReason = 'OTHER'; break;
                  default: adkFinishReason = 'OTHER';
              }
          }

          const adkSafetyRatings: AdkSafetyRating[] | undefined = candidate.safetyRatings?.map((sr: GoogleSafetyRating) => ({
            category: toAdkHarmCategory(sr.category),
            probability: toAdkHarmProbability(sr.probability),
            blocked: (sr as any).blocked ?? undefined, 
          }));
          
          const resultCandidate: AdkCandidate = {
            index: candidate.index,
            content: {
              role: candidate.content?.role || 'model',
              parts: adkParts,
            },
            finishReason: adkFinishReason,
            safetyRatings: adkSafetyRatings,
            tokenCount: (candidate as any).tokenCount ?? undefined,
            citationMetadata: candidate.citationMetadata,
          };
          return resultCandidate;
        });
    }
    usageMetadata = fullResponse.usageMetadata;
  } else { 
    const chunk = responseUnion as EnhancedGenerateContentResponse;
    const parts: AdkPart[] = [];
    const text = chunk.text();
    if (text) parts.push({ text });
    
    const googleFunctionCalls = chunk.functionCalls?.(); 
    if (googleFunctionCalls && googleFunctionCalls.length > 0) {
      googleFunctionCalls.forEach(fc => parts.push({ functionCall: { name: fc.name, args: fc.args || {} } }));
    }
    
    if (parts.length > 0) {
        adkCandidates.push({
            content: { role: 'model', parts },
        });
    }
  }
  
  return {
    model,
    requestId,
    candidates: adkCandidates,
    usageMetadata: usageMetadata,
    error: undefined,
  };
}

function toGoogleGenerationConfig(adkConfig?: AdkGenerationConfig): GenerationConfig | undefined {
    if (!adkConfig) return undefined;
    return {
        candidateCount: adkConfig.candidateCount,
        stopSequences: adkConfig.stopSequences,
        maxOutputTokens: adkConfig.maxOutputTokens,
        temperature: adkConfig.temperature,
        topP: adkConfig.topP,
        topK: adkConfig.topK,
    };
}

function toGoogleSafetySettings(adkSettings?: AdkSafetySetting[]): GoogleSafetySetting[] | undefined {
    if (!adkSettings) return undefined;
    return adkSettings.map(s => ({
        category: s.category as unknown as GoogleHarmCategory, 
        threshold: s.threshold as unknown as GoogleHarmBlockThreshold, 
    }));
}

function toGoogleTools(adkTools?: AdkTool[]): GoogleTool[] | undefined {
    if (!adkTools) return undefined;
    return adkTools
        .filter(t => t.functionDeclarations && t.functionDeclarations.length > 0)
        .map(t => ({
            functionDeclarations: t.functionDeclarations!.map((fd: AdkFunctionDeclaration) => ({
                name: fd.name,
                description: fd.description,
                parameters: fd.parameters as any, 
            }))
        }));
}

export interface GeminiLlmConfig {
  apiKey?: string; 
  modelName: string;
}

export class GeminiLlm implements IBaseLlm {
  private client: GoogleGenerativeAI;
  public readonly modelName: string;
  public readonly modelNamePattern: string;

  constructor(config: GeminiLlmConfig) {
    if (!config.apiKey && !process.env.GOOGLE_API_KEY) {
      throw new Error('GeminiLlm: API key is required either in config or as GOOGLE_API_KEY environment variable.');
    }
    this.client = new GoogleGenerativeAI(config.apiKey || process.env.GOOGLE_API_KEY!);
    this.modelName = config.modelName;
    this.modelNamePattern = config.modelName; 
  }

  async generateContentAsync(request: LlmRequest): Promise<LlmResponse> {
    try {
      const modelParams: any = {
        generationConfig: toGoogleGenerationConfig(request.generationConfig),
        safetySettings: toGoogleSafetySettings(request.safetySettings),
        tools: toGoogleTools(request.tools),
      };
      if (request.systemInstruction) {
        modelParams.systemInstruction = {
            role: request.systemInstruction.role || 'system',
            parts: request.systemInstruction.parts.map((p: AdkPart) => ({ text: p.text || '' }))
        };
      }

      const generativeModel = this.client.getGenerativeModel({ model: request.model || this.modelName, ...modelParams });
      const googleReqContents = toGoogleContent(request.contents);
      const result = await generativeModel.generateContent({ contents: googleReqContents }); 
      return toAdkResponse(result.response, request.model || this.modelName, request.requestId);
    } catch (error: any) {
      console.error(`GeminiLlm (${this.modelName}): Error in generateContentAsync`, error);
      const adkError: LlmError = {
        code: error.status || (error instanceof Error && 'code' in error && typeof error.code === 'number' ? error.code : 500),
        message: error.message || 'An unknown error occurred with the LLM provider.',
        details: error.stack,
      };
      return {
        model: request.model || this.modelName,
        requestId: request.requestId,
        candidates: [],
        error: adkError,
      };
    }
  }

  async *generateContentStreamAsync(request: LlmRequest): AsyncGenerator<LlmResponse, void, unknown> {
    try {
        const modelParams: any = { 
            generationConfig: toGoogleGenerationConfig(request.generationConfig),
            safetySettings: toGoogleSafetySettings(request.safetySettings),
            tools: toGoogleTools(request.tools),
        };
        if (request.systemInstruction) {
            modelParams.systemInstruction = {
                role: request.systemInstruction.role || 'system', 
                parts: request.systemInstruction.parts.map((p: AdkPart) => ({ text: p.text || '' }))
            };
        }

      const generativeModel = this.client.getGenerativeModel({ model: request.model || this.modelName, ...modelParams });
      const googleReqContents = toGoogleContent(request.contents);
      const streamResult = await generativeModel.generateContentStream({ contents: googleReqContents });

      for await (const chunk of streamResult.stream) {
        yield toAdkResponse(chunk, request.model || this.modelName, request.requestId);
      }

    } catch (error: any) {
      console.error(`GeminiLlm (${this.modelName}): Error in generateContentStreamAsync`, error);
      const adkError: LlmError = {
        code: error.status || (error instanceof Error && 'code' in error && typeof error.code === 'number' ? error.code : 500),
        message: error.message || 'An unknown error occurred with the LLM provider during streaming.',
        details: error.stack,
      };
      yield {
        model: request.model || this.modelName,
        requestId: request.requestId,
        candidates: [],
        error: adkError,
      };
    }
  }

  async countTokensAsync(request: LlmRequest): Promise<number> {
    try {
        const modelConfigForCount: any = {};
         if (request.systemInstruction) {
            if (typeof request.systemInstruction === 'string') { 
                modelConfigForCount.systemInstruction = { role: 'system', parts: [{text: request.systemInstruction}] };
            } else {
                 modelConfigForCount.systemInstruction = {
                     role: request.systemInstruction.role || 'system',
                     parts: request.systemInstruction.parts.map((p:AdkPart) => ({text: p.text || ''})) 
                 };
            }
        }
      const generativeModel = this.client.getGenerativeModel({ model: request.model || this.modelName });
      const googleReqContents = toGoogleContent(request.contents);
      
      const countRequest: GenerateContentRequest = { contents: googleReqContents };
      if (modelConfigForCount.systemInstruction) {
          countRequest.systemInstruction = modelConfigForCount.systemInstruction as GoogleContent;
      }

      const count = await generativeModel.countTokens(countRequest); 
      return count.totalTokens;
    } catch (error: any) {
      console.error(`GeminiLlm (${this.modelName}): Error in countTokensAsync`, error);
      throw error; 
    }
  }
} 