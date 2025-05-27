import { LlmRequest } from '../../models/LlmRequest.js';
import { InvocationContext } from '../../common/InvocationContext.js';
import { ILlmRequestProcessor } from '../FlowProcessor.js';
import { Content } from '../../models/LlmContent.js';
import { IAgent } from '../../agents/IAgent.js';

/**
 * Processor to add system instructions to the LLM request from agent.llmConfig.systemInstruction.
 */
export class InstructionsRequestProcessor implements ILlmRequestProcessor {
  async processRequest(request: LlmRequest, context: InvocationContext): Promise<LlmRequest | void> {
    const agent = context.agent as IAgent; 
    let systemInstructionSource: string | Content | undefined;

    // Prefer llmConfig.systemInstruction, fallback to a direct systemInstruction property on the agent if it exists.
    if (agent?.llmConfig?.systemInstruction) {
      systemInstructionSource = agent.llmConfig.systemInstruction;
    } else if ((agent as any)?.systemInstruction) { 
      systemInstructionSource = (agent as any).systemInstruction;
    }

    if (systemInstructionSource) {
      let instructionContent: Content;
      if (typeof systemInstructionSource === 'string') {
        instructionContent = { parts: [{ text: systemInstructionSource }], role: 'system' };
      } else {
        // If it's already a Content object, ensure role is 'system'
        instructionContent = { ...systemInstructionSource, role: 'system' };
      }

      // Prepend the system instruction to the main contents array.
      // The LLM adapter (e.g., GeminiLlm) should be responsible for deciding how to send this
      // (e.g., as a dedicated system message if supported, or as the first content item).
      // For Gemini, the first Content object with role 'system' or 'user' can act as system instruction.
      if (!request.contents) {
        request.contents = [];
      }
      request.contents.unshift(instructionContent);

      // Remove the top-level `request.systemInstruction` if it exists, as we've moved it into `contents`.
      // This avoids potential conflicts or duplicate handling by LLM SDKs.
      if (request.systemInstruction) {
        delete request.systemInstruction;
      }
      // console.log('InstructionsRequestProcessor: Added system instructions to request.contents');
    }
    // No explicit return, request is modified in place, fulfilling `void` part of return type.
  }
} 