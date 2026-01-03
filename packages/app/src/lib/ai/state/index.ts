/**
 * AI Chat State Module
 *
 * Exports for Durable State-based chat transcript persistence.
 */

export { chatStateSchema } from "./schema";
export type { Message, MessageRole, MessageStatus, Chunk, Run, RunStatus } from "./schema";

export {
  createChatStreamDB,
  createAndPreloadChatStreamDB,
  createServerChatStreamDB,
  createAndPreloadServerChatStreamDB,
} from "./db";
export type { ChatStreamDB } from "./db";

export { hydrateTranscript, hydrateFromArrays, toModelMessages } from "./hydrate";
export type { HydratedMessage } from "./hydrate";

export {
  createPendingToolCall,
  approveToolCall,
  rejectToolCall,
  completeToolCall,
  failToolCall,
  getPendingApprovals,
} from "./tool-approval";
