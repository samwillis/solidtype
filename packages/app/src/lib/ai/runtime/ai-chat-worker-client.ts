/**
 * AI Chat Worker Client
 *
 * Client-side interface for managing AI chat sessions in SharedWorker.
 *
 * Architecture:
 * - Worker runs TanStack AI chat loop with Durable Stream adapter
 * - Client delegates message sending to worker
 * - Worker wakes up automatically when messages are sent
 * - Session state persists in Durable Streams (survives worker shutdown)
 */

import type { AIChatWorkerCommand, AIChatWorkerEvent } from "./types";

export class AIChatWorkerClient {
  private worker: SharedWorker | Worker | null = null;
  private port: MessagePort | null = null;
  private eventHandlers = new Set<(event: AIChatWorkerEvent) => void>();
  private connected = false;
  private sessionId: string | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private sessionInitialized = false; // Track if session is fully initialized
  private initializedDocumentId: string | undefined; // Track what documentId we initialized with

  /**
   * Initialize connection to worker for a specific session.
   * Each session gets its own SharedWorker instance with an isolated OCCT kernel.
   *
   * @param sessionId - The chat session UUID. Workers are named by session ID,
   *                    so multiple tabs with the same session share one worker,
   *                    but different sessions get completely isolated workers.
   */
  async connect(sessionId: string): Promise<void> {
    console.log("[AI Chat Worker Client] 🔌 Connecting to worker for session:", sessionId);

    // If already connected to a different session, disconnect first
    if (this.connected && this.sessionId !== sessionId) {
      console.log("[AI Chat Worker Client] Disconnecting from previous session:", this.sessionId);
      this.disconnect();
    }

    if (this.connected) {
      console.log("[AI Chat Worker Client] Already connected to session:", sessionId);
      return;
    }

    this.sessionId = sessionId;

    try {
      // Check if SharedWorker is available
      const hasSharedWorker = typeof SharedWorker !== "undefined";
      console.log("[AI Chat Worker Client] SharedWorker available:", hasSharedWorker);

      // Try SharedWorker first - named by session ID for isolation
      if (hasSharedWorker) {
        const workerUrl = new URL("./ai-chat-worker.ts", import.meta.url);
        console.log("[AI Chat Worker Client] Creating SharedWorker:", {
          url: workerUrl.href,
          name: `ai-chat-worker-${sessionId}`,
        });

        try {
          this.worker = new SharedWorker(workerUrl, {
            type: "module",
            name: `ai-chat-worker-${sessionId}`,
          });
          console.log("[AI Chat Worker Client] ✅ SharedWorker created successfully");

          // Add error handler
          this.worker.onerror = (event) => {
            console.error("[AI Chat Worker Client] ❌ SharedWorker error:", event);
            console.error("[AI Chat Worker Client] Error details:", {
              message: event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
            });
          };

          this.port = this.worker.port;
          this.port.start();
          console.log("[AI Chat Worker Client] Port started");
        } catch (workerError) {
          console.error("[AI Chat Worker Client] ❌ Failed to create SharedWorker:", workerError);
          throw workerError;
        }
      } else {
        // Fallback to regular Worker (no multi-tab coordination, but still works)
        console.log("[AI Chat Worker Client] Falling back to regular Worker");
        this.worker = new Worker(new URL("./ai-chat-worker.ts", import.meta.url), {
          type: "module",
        });
        console.log("[AI Chat Worker Client] ✅ Regular Worker created");
      }

      this.setupMessageHandler();
      this.connected = true;
      console.log("[AI Chat Worker Client] ✅ Connected successfully");

      // Ping to verify connection
      console.log("[AI Chat Worker Client] Sending ping...");
      this.sendCommand({ type: "ping" });
    } catch (error) {
      console.error("[AI Chat Worker Client] ❌ Failed to connect:", error);
      this.connected = false;
      this.worker = null;
      this.port = null;
      throw error;
    }
  }

  /**
   * Setup message handler
   */
  private setupMessageHandler() {
    console.log("[AI Chat Worker Client] Setting up message handler");

    const handler = (event: MessageEvent<AIChatWorkerEvent>) => {
      console.log("[AI Chat Worker Client] 📩 Received event from worker:", event.data.type);

      // Handle ready event
      if (
        event.data.type === "session-ready" &&
        "sessionId" in event.data &&
        event.data.sessionId === this.sessionId
      ) {
        console.log("[AI Chat Worker Client] ✅ Received session-ready event");
        if (this.readyResolve) {
          this.readyResolve();
          this.readyResolve = null;
        }
      }

      for (const callback of this.eventHandlers) {
        callback(event.data);
      }
    };

    if (this.port) {
      this.port.onmessage = handler;
      console.log("[AI Chat Worker Client] Handler attached to port");
    } else if (this.worker && "onmessage" in this.worker) {
      this.worker.onmessage = handler;
      console.log("[AI Chat Worker Client] Handler attached to worker");
    } else {
      console.error("[AI Chat Worker Client] ❌ No port or worker to attach handler to!");
    }
  }

  /**
   * Send command to worker
   */
  private sendCommand(command: AIChatWorkerCommand) {
    if (!this.connected) {
      console.error("[AI Chat Worker Client] ❌ Cannot send command - not connected");
      throw new Error("Worker not connected. Call connect() first.");
    }

    console.log("[AI Chat Worker Client] 📤 Sending command:", command.type);

    if (this.port) {
      this.port.postMessage(command);
    } else if (this.worker && "postMessage" in this.worker) {
      this.worker.postMessage(command);
    } else {
      console.error("[AI Chat Worker Client] ❌ No port or worker to send to!");
    }
  }

  /**
   * Wait for worker to be ready (session initialized and stream synced)
   */
  private waitForReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve) => {
        this.readyResolve = resolve;
        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.readyResolve === resolve) {
            console.warn(
              "[AI Chat Worker Client] ⚠️ waitForReady timed out after 30s, resolving anyway"
            );
            resolve(); // Resolve anyway to prevent hanging
          }
        }, 30000);
      });
    }
    return this.readyPromise;
  }

  /**
   * Initialize a session in the worker.
   * This connects to a session-specific SharedWorker and initializes the session state.
   * The worker will:
   * - Connect to Durable Stream for the session
   * - Sync Yjs document if documentId is provided
   * - Resume any in-progress runs
   */
  async initSession(
    sessionId: string,
    options?: { documentId?: string; projectId?: string }
  ): Promise<void> {
    console.log("[AI Chat Worker Client] 🏁 initSession called:", { sessionId, options });

    await this.connect(sessionId);

    // Check if we need to re-initialize due to documentId change
    const needsReinit =
      this.sessionInitialized &&
      this.sessionId === sessionId &&
      options?.documentId &&
      this.initializedDocumentId !== options.documentId;

    if (needsReinit) {
      console.log(
        "[AI Chat Worker Client] 🔄 Re-initializing with new documentId:",
        options.documentId
      );
      this.sessionInitialized = false;
    }

    // If already initialized for this session with same options, skip
    if (this.sessionInitialized && this.sessionId === sessionId) {
      console.log("[AI Chat Worker Client] Session already initialized, skipping");
      return;
    }

    // If we already have a pending ready promise for this session, just wait for it
    // This prevents race conditions when multiple callers try to init the same session
    if (this.readyPromise && this.sessionId === sessionId && !needsReinit) {
      console.log("[AI Chat Worker Client] Already initializing, waiting for existing promise...");
      await this.readyPromise;
      console.log("[AI Chat Worker Client] ✅ Session ready (from existing promise)!");
      return;
    }

    // Reset ready state for new initialization
    this.readyPromise = null;
    this.readyResolve = null;
    this.sessionInitialized = false;

    console.log("[AI Chat Worker Client] Sending init-session command...");
    this.sendCommand({
      type: "init-session",
      sessionId,
      documentId: options?.documentId,
      projectId: options?.projectId,
    });

    // Wait for session-ready event
    console.log("[AI Chat Worker Client] ⏳ Waiting for session-ready...");
    await this.waitForReady();
    this.sessionInitialized = true;
    this.initializedDocumentId = options?.documentId;
    console.log("[AI Chat Worker Client] ✅ Session ready!");
  }

  /**
   * Send a message (wake up worker if needed)
   *
   * This is the primary method for sending messages. It:
   * - Spawns the worker if not running
   * - Initializes the session if not initialized
   * - Waits for the session to be ready
   * - Sends the message
   *
   * @param sessionId - The chat session UUID
   * @param content - The message content
   * @param options - Session options (documentId, projectId)
   */
  async sendMessage(
    sessionId: string,
    content: string,
    options?: { documentId?: string; projectId?: string }
  ): Promise<void> {
    console.log("[AI Chat Worker Client] 💬 sendMessage called:", {
      sessionId,
      contentLength: content.length,
      options,
    });

    // Connect and initialize if needed
    await this.initSession(sessionId, options);

    // Send the message - worker handles the full chat loop
    console.log("[AI Chat Worker Client] Sending send-message command to worker...");
    this.sendCommand({ type: "send-message", sessionId, content });
    console.log("[AI Chat Worker Client] ✅ send-message command sent");
  }

  /**
   * Stop the current run
   */
  stopRun(sessionId: string): void {
    if (!this.connected) return;
    this.sendCommand({ type: "stop-run", sessionId });
  }

  /**
   * Set the active sketch ID for sketch tools
   */
  setActiveSketch(sessionId: string, sketchId: string | null): void {
    if (!this.connected) return;
    this.sendCommand({ type: "set-active-sketch", sessionId, sketchId });
  }

  /**
   * Start a new run (legacy - use sendMessage instead)
   * @deprecated Use sendMessage() instead
   */
  async startRun(
    sessionId: string,
    content: string
  ): Promise<{ runId: string; userMessageId: string; assistantMessageId: string }> {
    console.warn("[AI Chat Worker Client] startRun is deprecated, use sendMessage");
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
   * @deprecated No longer needed - worker detects completion via Durable Stream
   */
  notifyRunComplete(sessionId: string): void {
    console.warn("[AI Chat Worker Client] notifyRunComplete is deprecated");
    if (!this.connected) return;
    this.sendCommand({ type: "run-complete", sessionId });
  }

  /**
   * Execute a local tool
   * @deprecated Tools are now executed automatically by the worker
   */
  async executeLocalTool(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    activeSketchId?: string
  ): Promise<unknown> {
    console.warn("[AI Chat Worker Client] executeLocalTool is deprecated");
    await this.connect(sessionId);
    this.sendCommand({
      type: "execute-local-tool",
      sessionId,
      toolName,
      args,
      activeSketchId,
    });

    // Wait for tool result
    return new Promise((resolve, reject) => {
      const handler = (event: AIChatWorkerEvent) => {
        if (event.type === "tool-result" && "toolName" in event && event.toolName === toolName) {
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
    this.sessionInitialized = false;
    this.initializedDocumentId = undefined;
    this.eventHandlers.clear();
    this.readyPromise = null;
    this.readyResolve = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
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
