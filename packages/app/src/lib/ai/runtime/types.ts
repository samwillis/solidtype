/**
 * AI Chat Runtime Types
 *
 * Types for SharedWorker-based local session management, run coordination,
 * and CAD kernel execution.
 */

/**
 * Session state managed in the worker
 */
export interface AIChatSessionState {
  sessionId: string;
  documentId?: string;
  projectId?: string;
  kernelInitialized: boolean;
  activeRunId: string | null;
}

/**
 * Messages from main thread to worker
 */
export type AIChatWorkerCommand =
  | { type: "init-session"; sessionId: string; documentId?: string; projectId?: string }
  | { type: "start-run"; sessionId: string; content: string }
  | { type: "run-complete"; sessionId: string }
  | { type: "execute-local-tool"; toolName: string; args: Record<string, unknown> }
  | { type: "terminate-session"; sessionId: string }
  | { type: "ping" };

/**
 * Messages from worker to main thread
 */
export type AIChatWorkerEvent =
  | { type: "session-ready"; sessionId: string }
  | { type: "kernel-initialized"; sessionId: string }
  | {
      type: "run-started";
      sessionId: string;
      runId: string;
      userMessageId: string;
      assistantMessageId: string;
    }
  | { type: "run-complete"; sessionId: string }
  | { type: "run-rejected"; sessionId: string; reason: string }
  | { type: "run-error"; sessionId: string; error: string }
  | { type: "tool-result"; toolName: string; result: unknown; error?: string }
  | { type: "error"; message: string; sessionId?: string }
  | { type: "pong" };
