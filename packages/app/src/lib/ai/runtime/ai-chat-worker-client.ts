/**
 * AI Chat Worker Client
 *
 * Client-side interface for managing AI chat sessions in SharedWorker.
 * Handles connection, session initialization, and local tool execution.
 */

import type { AIChatWorkerCommand, AIChatWorkerEvent } from "./types";

export class AIChatWorkerClient {
  private worker: SharedWorker | Worker | null = null;
  private port: MessagePort | null = null;
  private eventHandlers = new Set<(event: AIChatWorkerEvent) => void>();
  private connected = false;

  /**
   * Initialize connection to worker
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Try SharedWorker first
      if (typeof SharedWorker !== "undefined") {
        this.worker = new SharedWorker(new URL("./ai-chat-worker.ts", import.meta.url), {
          type: "module",
          name: "ai-chat-worker",
        });
        this.port = this.worker.port;
        this.port.start();
      } else {
        // Fallback to regular Worker
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
   * Initialize a session in the worker
   */
  async initSession(
    sessionId: string,
    options?: { documentId?: string; projectId?: string }
  ): Promise<void> {
    await this.connect();
    this.sendCommand({
      type: "init-session",
      sessionId,
      documentId: options?.documentId,
      projectId: options?.projectId,
    });
  }

  /**
   * Execute a local tool (CAD operations in worker kernel)
   */
  async executeLocalTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    await this.connect();
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
    if (this.worker && "terminate" in this.worker) {
      this.worker.terminate();
    }
    this.worker = null;
    this.port = null;
    this.connected = false;
    this.eventHandlers.clear();
  }
}

// Singleton instance
let workerClientInstance: AIChatWorkerClient | null = null;

/**
 * Get the global worker client instance
 */
export function getAIChatWorkerClient(): AIChatWorkerClient {
  if (!workerClientInstance) {
    workerClientInstance = new AIChatWorkerClient();
  }
  return workerClientInstance;
}
