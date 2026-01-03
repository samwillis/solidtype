/**
 * AI Chat Runtime Types
 *
 * Types for SharedWorker-based local session management and CAD kernel execution.
 */

/**
 * Session state managed in the worker
 */
export interface AIChatSessionState {
  sessionId: string;
  documentId?: string;
  projectId?: string;
  kernelInitialized: boolean;
}

/**
 * Messages from main thread to worker
 */
export type AIChatWorkerCommand =
  | { type: "init-session"; sessionId: string; documentId?: string; projectId?: string }
  | { type: "execute-local-tool"; toolName: string; args: Record<string, unknown> }
  | { type: "terminate-session"; sessionId: string }
  | { type: "ping" };

/**
 * Messages from worker to main thread
 */
export type AIChatWorkerEvent =
  | { type: "session-ready"; sessionId: string }
  | { type: "kernel-initialized"; sessionId: string }
  | { type: "tool-result"; toolName: string; result: unknown; error?: string }
  | { type: "error"; message: string; sessionId?: string }
  | { type: "pong" };
