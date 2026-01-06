/**
 * AI Chat Runtime Types
 *
 * Types for SharedWorker-based local session management, run coordination,
 * and CAD kernel execution.
 *
 * Architecture:
 * - Worker runs TanStack AI chat loop with custom Durable Stream adapter
 * - Client tools (sketch) execute in worker, results written to Durable Stream
 * - Server tools execute on server during chat() call
 * - Main thread delegates to worker for message sending
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
  /** Whether the Yjs document is synced (for local tool execution) */
  documentSynced: boolean;
}

/**
 * Messages from main thread to worker
 */
export type AIChatWorkerCommand =
  // Session lifecycle
  | { type: "init-session"; sessionId: string; documentId?: string; projectId?: string }
  | { type: "terminate-session"; sessionId: string }
  // Chat operations - worker handles the full chat loop
  | { type: "send-message"; sessionId: string; content: string }
  | { type: "stop-run"; sessionId: string }
  // Sketch context
  | { type: "set-active-sketch"; sessionId: string; sketchId: string | null }
  // Health check
  | { type: "ping" }
  // Legacy commands (deprecated, will be removed)
  | {
      /** @deprecated Use send-message instead - worker now runs full chat loop */
      type: "start-run";
      sessionId: string;
      content: string;
    }
  | {
      /** @deprecated No longer used - run completion detected via Durable Stream */
      type: "run-complete";
      sessionId: string;
    }
  | {
      /** @deprecated Client tools now executed via TanStack AI in worker */
      type: "execute-local-tool";
      sessionId: string;
      toolName: string;
      args: Record<string, unknown>;
      activeSketchId?: string;
    };

/**
 * Messages from worker to main thread
 */
export type AIChatWorkerEvent =
  // Session lifecycle
  | { type: "session-ready"; sessionId: string }
  | { type: "session-error"; sessionId: string; error: string }
  | { type: "kernel-initialized"; sessionId: string }
  // Run lifecycle
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
  // Streaming updates
  | { type: "content-chunk"; sessionId: string; delta: string; content: string }
  | { type: "tool-result"; sessionId: string; toolName: string; result?: unknown; error?: string }
  // Worker state
  | { type: "worker-ready"; sessionId: string }
  | { type: "worker-syncing"; sessionId: string }
  // General
  | { type: "error"; message: string; sessionId?: string }
  | { type: "pong" };
