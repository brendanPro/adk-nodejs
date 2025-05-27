import { CallbackContext } from '../common/CallbackContext.js';
import { Content } from '../models/LlmContent.js';

/** 
 * Type for a single agent callback function.
 * It receives a CallbackContext and can optionally return Content to override agent behavior.
 */
export type SingleAgentCallback = (
  context: CallbackContext
) => Promise<Content | null | undefined> | Content | null | undefined;

/** Type for before_agent_callback: can be a single callback or a list. */
export type BeforeAgentCallback = SingleAgentCallback | SingleAgentCallback[];

/** Type for after_agent_callback: can be a single callback or a list. */
export type AfterAgentCallback = SingleAgentCallback | SingleAgentCallback[]; 