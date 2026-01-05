/**
 * AI Chat Worker Client
 *
 * Client-side interface for managing AI chat sessions in SharedWorker.
 * Handles connection, session initialization, run coordination, and local tool execution.
 */

import type { AIChatWorkerCommand, AIChatWorkerEvent } from "./types";

export class AIChatWorkerClient {
  private worker: SharedWorker | Worker | null = null;
  private port: MessagePort | null = null;
  private eventHandlers = new Set<(event: AIChatWorkerEvent) => void>();
  private connected = false;
  private sessionId: string | null = null;

  /**
   * Initialize connection to worker for a specific session.
   * Each session gets its own SharedWorker instance with an isolated OCCT kernel.
   * This prevents conflicts when multiple agents work on CAD models simultaneously.
   *
   * @param sessionId - The chat session UUID. Workers are named by session ID,
   *                    so multiple tabs with the same session share one worker,
   *                    but different sessions get completely isolated workers.
   */
  async connect(sessionId: string): Promise<void> {
    // If already connected to a different session, disconnect first
    if (this.connected && this.sessionId !== sessionId) {
      this.disconnect();
    }

    if (this.connected) return;

    this.sessionId = sessionId;

    try {
      // Try SharedWorker first - named by session ID for isolation
      if (typeof SharedWorker !== "undefined") {
        this.worker = new SharedWorker(new URL("./ai-chat-worker.ts", import.meta.url), {
          type: "module",
          name: `ai-chat-worker-${sessionId}`,
        });
        this.port = this.worker.port;
        this.port.start();
      } else {
        // Fallback to regular Worker (no multi-tab coordination, but still works)
        this.worker = new Worker(new URL("./ai-chat-worker.ts", import.meta.url), {
          type: "module",
        });
      }

      this.setupMessageHandler();
      this.connected = true;

      // Ping to verify connection
      this.sendCommand({ type: "ping" });
    } catch (error) {
      console.error("[AI Chat Worker Client] Failed to connect:", error);
      throw error;
    }
  }

  /**
   * Setup message handler
   */
  private setupMessageHandler() {
    const handler = (event: MessageEvent<AIChatWorkerEvent>) => {
      for (const callback of this.eventHandlers) {
        callback(event.data);
      }
    };

    if (this.port) {
      this.port.onmessage = handler;
    } else if (this.worker && "onmessage" in this.worker) {
      this.worker.onmessage = handler;
    }
  }

  /**
   * Send command to worker
   */
  private sendCommand(command: AIChatWorkerCommand) {
    if (!this.connected) {
      throw new Error("Worker not connected. Call connect() first.");
    }

    if (this.port) {
      this.port.postMessage(command);
    } else if (this.worker && "postMessage" in this.worker) {
      this.worker.postMessage(command);
    }
  }

  /**
   * Initialize a session in the worker.
   * This connects to a session-specific SharedWorker and initializes the session state.
   */
  async initSession(
    sessionId: string,
    options?: { documentId?: string; projectId?: string }
  ): Promise<void> {
    await this.connect(sessionId);
    this.sendCommand({
      type: "init-session",
      sessionId,
      documentId: options?.documentId,
      projectId: options?.projectId,
    });
  }

  /**
   * Start a new run (user message + assistant response)
   *
   * @param sessionId - The chat session UUID
   * @param content - The user message content
   * @returns Promise that resolves when the run is started (not completed)
   */
  async startRun(
    sessionId: string,
    content: string
  ): Promise<{ runId: string; userMessageId: string; assistantMessageId: string }> {
    await this.connect(sessionId);
    this.sendCommand({ type: "start-run", sessionId, content });

    // Wait for response
    return new Promise((resolve, reject) => {
      const handler = (event: AIChatWorkerEvent) => {
        if ("sessionId" in event && event.sessionId !== sessionId) return;

        if (event.type === "run-started") {
          this.eventHandlers.delete(handler);
          resolve({
            runId: event.runId,
            userMessageId: event.userMessageId,
            assistantMessageId: event.assistantMessageId,
          });
        } else if (event.type === "run-rejected") {
          this.eventHandlers.delete(handler);
          reject(new Error(event.reason));
        } else if (event.type === "run-error") {
          this.eventHandlers.delete(handler);
          reject(new Error(event.error));
        }
      };
      this.eventHandlers.add(handler);

      // Timeout after 30 seconds
      setTimeout(() => {
        this.eventHandlers.delete(handler);
        reject(new Error("Start run timeout"));
      }, 30000);
    });
  }

  /**
   * Notify worker that a run has completed
   * Called when the UI observes the run status change in Durable State
   *
   * @param sessionId - The chat session UUID
   */
  notifyRunComplete(sessionId: string): void {
    if (!this.connected) return;
    this.sendCommand({ type: "run-complete", sessionId });
  }

  /**
   * Execute a local tool (CAD operations in worker kernel)
   *
   * @param sessionId - The chat session UUID (determines which worker to use)
   * @param toolName - The tool to execute
   * @param args - Tool arguments
   */
  async executeLocalTool(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    await this.connect(sessionId);
    this.sendCommand({
      type: "execute-local-tool",
      toolName,
      args,
    });

    // Wait for tool result
    return new Promise((resolve, reject) => {
      const handler = (event: AIChatWorkerEvent) => {
        if (event.type === "tool-result" && event.toolName === toolName) {
          this.eventHandlers.delete(handler);
          if (event.error) {
            reject(new Error(event.error));
          } else {
            resolve(event.result);
          }
        } else if (event.type === "error") {
          this.eventHandlers.delete(handler);
          reject(new Error(event.message));
        }
      };
      this.eventHandlers.add(handler);

      // Timeout after 30 seconds
      setTimeout(() => {
        this.eventHandlers.delete(handler);
        reject(new Error("Tool execution timeout"));
      }, 30000);
    });
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string): Promise<void> {
    if (!this.connected) return;
    this.sendCommand({ type: "terminate-session", sessionId });
  }

  /**
   * Listen for events from worker
   */
  onEvent(handler: (event: AIChatWorkerEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Disconnect from worker
   */
  disconnect() {
    if (this.port) {
      this.port.close();
    }
    // Note: Don't terminate SharedWorkers - other tabs may still be using them
    // They will self-terminate after idle timeout (3 minutes)
    if (this.worker && !("port" in this.worker) && "terminate" in this.worker) {
      // Only terminate DedicatedWorkers (fallback mode)
      this.worker.terminate();
    }
    this.worker = null;
    this.port = null;
    this.connected = false;
    this.sessionId = null;
    this.eventHandlers.clear();
  }

  /**
   * Get the currently connected session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}

// Map of clients by session ID for proper isolation
const workerClients = new Map<string, AIChatWorkerClient>();

/**
 * Get a worker client for a specific session.
 *
 * Each session gets its own client connected to a session-specific SharedWorker.
 * This ensures complete isolation between AI agents working on different documents.
 *
 * @param sessionId - The chat session UUID
 */
export function getAIChatWorkerClient(sessionId?: string): AIChatWorkerClient {
  // If no sessionId provided, return a new unconnected client
  // (caller must call connect(sessionId) before using it)
  if (!sessionId) {
    return new AIChatWorkerClient();
  }

  let client = workerClients.get(sessionId);
  if (!client) {
    client = new AIChatWorkerClient();
    workerClients.set(sessionId, client);
  }
  return client;
}

/**
 * Clean up a client for a session (call when session is terminated)
 */
export function disposeAIChatWorkerClient(sessionId: string): void {
  const client = workerClients.get(sessionId);
  if (client) {
    client.disconnect();
    workerClients.delete(sessionId);
  }
}
