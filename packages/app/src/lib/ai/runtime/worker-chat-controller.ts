/**
 * Worker Chat Controller
 *
 * Manages TanStack AI chat state within the SharedWorker.
 * Handles:
 * - Streaming via custom Durable Stream adapter
 * - Client tool execution (sketch tools)
 * - Writing tool results back to Durable Stream
 * - Broadcasting UI updates to main thread
 * - Running its own KernelEngine for geometry queries (Phase 5)
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 5
 */

import * as Y from "yjs";
import { v4 as uuid } from "uuid";
import { streamChunksFromDurableStream, type StreamChunk } from "./durable-stream-adapter";
import { createChatStreamDB, type ChatStreamDB } from "../state/db";
import { chatStateSchema, type Run } from "../state/schema";
import { executeSketchTool, isSketchTool } from "./sketch-tool-executor";
import { executeModelingTool, isModelingTool } from "./modeling-tool-executor";
import { createDocumentSync, type DocumentSync } from "../../yjs-sync";
import { loadDocument, type SolidTypeDoc } from "../../../editor/document/createDocument";
import type { AIChatWorkerEvent } from "./types";
import { KernelEngine, type RebuildResult } from "../../../editor/kernel";

// Note: OCCT imports are dynamic in initKernelEngine to avoid loading WASM in test environments

/**
 * Broadcast function type - provided by the worker
 */
type BroadcastFn = (event: AIChatWorkerEvent) => void;

/**
 * Options for initializing the chat controller
 */
export interface ChatControllerOptions {
  sessionId: string;
  documentId?: string;
  projectId?: string;
  broadcast: BroadcastFn;
}

/**
 * State of the chat controller
 */
export type ChatControllerState = "initializing" | "ready" | "streaming" | "error";

/**
 * Worker Chat Controller
 *
 * Manages chat session state and tool execution in the worker.
 */
export class WorkerChatController {
  readonly sessionId: string;
  readonly documentId?: string;
  readonly projectId?: string;

  private broadcast: BroadcastFn;
  private streamDb: ChatStreamDB | null = null;
  private state: ChatControllerState = "initializing";
  private currentRunId: string | null = null;
  private abortController: AbortController | null = null;

  // Document sync for sketch tools
  private ydoc: Y.Doc | null = null;
  private docSync: DocumentSync | null = null;
  private wrappedDoc: SolidTypeDoc | null = null;
  private documentSynced = false;

  // Active sketch context
  private activeSketchId: string | null = null;

  /**
   * Local KernelEngine for geometry queries when no UI is connected.
   * Enables AI to work even when no UI tab is open.
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 5
   */
  private kernelEngine: KernelEngine | null = null;
  private kernelInitialized = false;
  private rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Last kernel rebuild result - used for geometry-aware tool queries.
   * Can come from either:
   * 1. The local KernelEngine (when running independently)
   * 2. The UI kernel worker via setRebuildResult() (when UI is connected)
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 5/7
   */
  private lastRebuildResult: RebuildResult | null = null;

  constructor(options: ChatControllerOptions) {
    this.sessionId = options.sessionId;
    this.documentId = options.documentId;
    this.projectId = options.projectId;
    this.broadcast = options.broadcast;
  }

  /**
   * Initialize the controller
   */
  async initialize(): Promise<void> {
    console.log("[ChatController] 🚀 Initializing:", this.sessionId);

    try {
      // 1. Connect to chat stream (may be empty for new sessions)
      this.streamDb = createChatStreamDB(this.sessionId);
      try {
        await this.streamDb.preload();
        console.log("[ChatController] ✅ Stream connected");
      } catch (err) {
        // Stream might not exist for new sessions - that's OK
        // The server will create it when we POST to /run
        console.log("[ChatController] ⚠️ Stream preload failed (may not exist yet):", err);
      }

      // 2. If we have a document, sync it for tool execution
      if (this.documentId) {
        await this.initDocumentSync();
      }

      // 3. Check for active run and resume if needed
      const activeRun = await this.checkForActiveRun();
      if (activeRun) {
        console.log("[ChatController] Found active run, resuming:", activeRun.id);
        await this.resumeRun(activeRun.id);
      } else {
        this.state = "ready";
      }

      // Notify main thread that we're ready
      this.broadcast({
        type: "session-ready",
        sessionId: this.sessionId,
      });
    } catch (error) {
      console.error("[ChatController] Initialization failed:", error);
      this.state = "error";
      this.broadcast({
        type: "error",
        message: error instanceof Error ? error.message : "Initialization failed",
        sessionId: this.sessionId,
      });
      throw error;
    }
  }

  /**
   * Initialize Yjs document sync for tool execution
   */
  private async initDocumentSync(): Promise<void> {
    if (!this.documentId) return;

    return new Promise((resolve, reject) => {
      this.ydoc = new Y.Doc();
      const sync = createDocumentSync(this.documentId!, this.ydoc);
      this.docSync = sync;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Document sync timeout"));
      }, 30000);

      const cleanup = () => {
        clearTimeout(timeout);
        unsubSynced();
        unsubError();
      };

      const unsubSynced = sync.onSynced(async (synced) => {
        if (synced) {
          console.log("[ChatController] Document synced:", this.documentId);
          this.documentSynced = true;
          this.wrappedDoc = loadDocument(this.ydoc!);
          cleanup();

          // Initialize kernel engine for geometry queries (Phase 5)
          // This is fire-and-forget - don't block on it or reject on failure
          this.initKernelEngine().catch(() => {
            // Errors are already logged in initKernelEngine
          });

          resolve();
        }
      });

      const unsubError = sync.onError((error) => {
        cleanup();
        reject(error);
      });

      // Keep listening for errors even after initial sync
      sync.onError((error) => {
        console.error("[ChatController] ❌ Document sync error (ongoing):", error);
      });

      // Log status changes
      sync.onStatus((status) => {
        console.log("[ChatController] 📡 Document sync status:", status);
      });

      sync.connect();
    });
  }

  /**
   * Initialize the local KernelEngine for geometry queries.
   * This enables the AI to work independently when no UI tab is open.
   *
   * Note: This is best-effort - OCCT initialization may fail in some environments
   * (e.g., tests, environments without WebAssembly support). The controller
   * will still function for document mutations, just without geometry queries.
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 5
   */
  private async initKernelEngine(): Promise<void> {
    if (this.kernelInitialized || !this.ydoc) return;

    // Skip in test environments or when running without full browser support
    if (typeof window === "undefined" && typeof self === "undefined") {
      console.log("[ChatController] ⏭️ Skipping KernelEngine init (non-browser environment)");
      return;
    }

    console.log("[ChatController] 🔧 Initializing KernelEngine...");

    try {
      // Dynamic imports to avoid loading WASM in test environments
      const [{ initOCCTBrowser }, { setOC }] = await Promise.all([
        import("../../../editor/worker/occt-init"),
        import("@solidtype/core"),
      ]);

      // Initialize OCCT
      const oc = await initOCCTBrowser();
      setOC(oc);

      // Create kernel engine (headless - no meshes needed for query-only mode)
      this.kernelEngine = new KernelEngine({
        computeMeshes: false,
        oc,
      });
      await this.kernelEngine.init();
      this.kernelInitialized = true;

      console.log("[ChatController] ✅ KernelEngine initialized");

      // Do initial rebuild
      await this.doRebuild();

      // Listen for document changes and trigger rebuilds
      this.ydoc.on("update", () => {
        this.scheduleRebuild();
      });
    } catch (err) {
      // Non-fatal - controller still works for mutations, just without geometry queries
      console.warn(
        "[ChatController] ⚠️ KernelEngine init failed (geometry queries unavailable):",
        err
      );
      // Don't rethrow - allow controller to continue without kernel
    }
  }

  /**
   * Schedule a rebuild after document changes (debounced)
   */
  private scheduleRebuild(): void {
    if (this.rebuildDebounceTimer) {
      clearTimeout(this.rebuildDebounceTimer);
    }
    this.rebuildDebounceTimer = setTimeout(() => {
      this.doRebuild().catch((err) => {
        console.error("[ChatController] Rebuild failed:", err);
      });
    }, 100);
  }

  /**
   * Perform a kernel rebuild
   */
  private async doRebuild(): Promise<void> {
    if (!this.kernelEngine || !this.ydoc) return;

    try {
      const result = await this.kernelEngine.rebuildFromYDoc(this.ydoc);
      this.lastRebuildResult = result;
      console.log(
        "[ChatController] 🔨 Rebuild complete - bodies:",
        result.bodies.length,
        "sketches:",
        result.sketchSolveResults.size
      );
    } catch (err) {
      console.error("[ChatController] Rebuild error:", err);
    }
  }

  /**
   * Check for an active run in the stream
   */
  private async checkForActiveRun(): Promise<Run | null> {
    if (!this.streamDb) return null;
    const runs = Array.from(this.streamDb.collections.runs.values());
    return runs.find((r) => r.status === "running") || null;
  }

  /**
   * Send a new message
   */
  async sendMessage(content: string): Promise<void> {
    if (this.state === "streaming") {
      throw new Error("A message is already being processed");
    }

    if (this.state !== "ready") {
      throw new Error(`Cannot send message in state: ${this.state}`);
    }

    console.log("[ChatController] 📤 Sending message:", content.slice(0, 50));
    this.state = "streaming";

    // Generate runId on client to avoid deadlock:
    // - We start streaming immediately with this runId
    // - POST is fire-and-forget; server will use the same runId
    // - No need to wait for POST response before streaming
    const runId = crypto.randomUUID();

    try {
      // Notify main thread that run is starting
      this.broadcast({
        type: "run-started",
        sessionId: this.sessionId,
        runId,
        userMessageId: "", // Server creates these
        assistantMessageId: "",
      });

      // Start streaming from Durable Stream BEFORE POST completes
      // This prevents deadlock where POST waits for tool result but
      // worker is blocked waiting for POST response
      const streamPromise = this.streamRun(runId);

      // 1. POST to server to start the run (provide our runId)
      console.log("[ChatController] 📡 POSTing to /run with runId:", runId);
      const postPromise = fetch(`/api/ai/sessions/${this.sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, runId }),
      }).then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        console.log("[ChatController] ✅ POST completed");
        return response.json();
      });

      // Wait for both to complete
      await Promise.all([streamPromise, postPromise]);
    } catch (error) {
      console.error("[ChatController] Send message failed:", error);
      this.state = "ready";
      this.broadcast({
        type: "run-error",
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : "Send failed",
      });
      throw error;
    }
  }

  /**
   * Stream a run's chunks and handle tool calls
   */
  private async streamRun(runId: string): Promise<void> {
    this.currentRunId = runId;
    this.abortController = new AbortController();

    try {
      const generator = streamChunksFromDurableStream(
        this.sessionId,
        runId,
        this.abortController.signal
      );

      for await (const chunk of generator) {
        await this.handleChunk(chunk, runId);
      }

      console.log("[ChatController] Run completed:", runId);
      this.state = "ready";
      this.broadcast({
        type: "run-complete",
        sessionId: this.sessionId,
      });
    } catch (error) {
      console.error("[ChatController] Stream error:", error);
      this.state = "ready";
      this.broadcast({
        type: "run-error",
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : "Stream error",
      });
    } finally {
      this.currentRunId = null;
      this.abortController = null;
    }
  }

  /**
   * Resume an existing run
   */
  async resumeRun(runId: string): Promise<void> {
    console.log("[ChatController] Resuming run:", runId);
    this.state = "streaming";

    try {
      await this.streamRun(runId);
    } catch (error) {
      console.error("[ChatController] Resume failed:", error);
      this.state = "ready";
    }
  }

  /**
   * Handle a stream chunk
   */
  private async handleChunk(chunk: StreamChunk, runId: string): Promise<void> {
    switch (chunk.type) {
      case "content":
        // Forward content to main thread for UI
        this.broadcast({
          type: "content-chunk",
          sessionId: this.sessionId,
          delta: chunk.delta,
          content: chunk.content,
        });
        break;

      case "tool_call":
        // Check if this is a client tool (sketch or modeling tool)
        const toolName = chunk.toolCall.function.name;
        const toolArgs = JSON.parse(chunk.toolCall.function.arguments);
        const toolCallId = chunk.toolCall.id;

        if (isSketchTool(toolName) || isModelingTool(toolName)) {
          // Execute client tool locally
          await this.executeClientTool(toolName, toolArgs, toolCallId, runId);
        }
        // Server tools (if any) are handled by the server
        break;

      case "tool_result":
        // Forward to main thread
        this.broadcast({
          type: "tool-result",
          sessionId: this.sessionId,
          toolName: "",
          result: chunk.content,
        });
        break;

      case "done":
        // Run complete - handled by streamRun()
        break;

      case "error":
        console.error("[ChatController] Stream error chunk:", chunk.error);
        break;
    }
  }

  /**
   * Execute a client tool (sketch or modeling tool)
   */
  private async executeClientTool(
    toolName: string,
    args: Record<string, unknown>,
    toolCallId: string,
    runId: string
  ): Promise<void> {
    console.log("[ChatController] Executing client tool:", toolName, args);

    // Track active sketch for subsequent tools (before execution)
    if (toolName === "enterSketch") {
      this.activeSketchId = args.sketchId as string;
    } else if (toolName === "exitSketch") {
      this.activeSketchId = null;
    }

    if (!this.wrappedDoc) {
      console.error("[ChatController] No document for tool execution");
      await this.writeToolResult(toolCallId, runId, { error: "No document available" });
      return;
    }

    try {
      let result: unknown;

      // Log document state before tool execution
      const featureCountBefore = this.wrappedDoc.featureOrder.length;
      console.log(
        "[ChatController] Before tool:",
        toolName,
        "features:",
        featureCountBefore,
        "docSync connected:",
        this.docSync?.connected,
        "synced:",
        this.docSync?.synced
      );

      // Route to appropriate tool executor
      if (isSketchTool(toolName)) {
        result = executeSketchTool(toolName, args, this.wrappedDoc, this.activeSketchId, {
          // Phase 7: Provide rebuild result for constraint solver feedback
          getRebuildResult: () => this.lastRebuildResult,
        });
      } else if (isModelingTool(toolName)) {
        // Phase 5/7: Pass rebuild result for geometry queries
        result = executeModelingTool(toolName, args, {
          doc: this.wrappedDoc,
          rebuildResult: this.lastRebuildResult ?? undefined,
        });
      } else {
        throw new Error(`Unknown tool type: ${toolName}`);
      }

      // Log document state after tool execution
      const featureCountAfter = this.wrappedDoc.featureOrder.length;
      console.log(
        "[ChatController] After tool:",
        toolName,
        "features:",
        featureCountAfter,
        "added:",
        featureCountAfter - featureCountBefore
      );

      // Log sync status to diagnose sync issues
      console.log(
        "[ChatController] Sync status after tool:",
        "connected:",
        this.docSync?.connected,
        "synced:",
        this.docSync?.synced,
        "featureOrder:",
        this.wrappedDoc.featureOrder.toArray()
      );

      console.log("[ChatController] Tool result:", result);

      // Track active sketch from createSketch result (if enterSketch was true)
      if (
        toolName === "createSketch" &&
        result &&
        typeof result === "object" &&
        "entered" in result &&
        result.entered === true &&
        "sketchId" in result
      ) {
        this.activeSketchId = result.sketchId as string;
        console.log("[ChatController] Entered sketch from createSketch:", this.activeSketchId);
      }

      // Write result to Durable Stream
      await this.writeToolResult(toolCallId, runId, result);

      // Notify main thread
      this.broadcast({
        type: "tool-result",
        sessionId: this.sessionId,
        toolName,
        result,
      });
    } catch (error) {
      console.error("[ChatController] Tool execution failed:", error);
      const errorResult = { error: error instanceof Error ? error.message : "Tool failed" };
      await this.writeToolResult(toolCallId, runId, errorResult);

      this.broadcast({
        type: "tool-result",
        sessionId: this.sessionId,
        toolName,
        error: error instanceof Error ? error.message : "Tool failed",
      });
    }
  }

  /**
   * Write a tool result to Durable Stream
   */
  private async writeToolResult(toolCallId: string, runId: string, result: unknown): Promise<void> {
    if (!this.streamDb) return;

    // Find the assistant message for this run
    const runs = Array.from(this.streamDb.collections.runs.values());
    const run = runs.find((r) => r.id === runId);
    const assistantMessageId = run?.assistantMessageId;

    await this.streamDb.stream.append(
      chatStateSchema.messages.insert({
        value: {
          id: uuid(),
          runId,
          role: "tool_result",
          status: "complete",
          parentMessageId: assistantMessageId,
          toolCallId,
          toolResult: result,
          createdAt: new Date().toISOString(),
        },
      })
    );
  }

  /**
   * Set the active sketch ID
   */
  setActiveSketchId(sketchId: string | null): void {
    this.activeSketchId = sketchId;
  }

  /**
   * Update the last rebuild result from the UI kernel worker.
   *
   * When a UI tab is connected, it sends rebuild results here for use by AI tools.
   * This supplements (or overrides) the local KernelEngine results.
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 5/7
   */
  setRebuildResult(rebuildResult: RebuildResult | null): void {
    // Only use UI results if local kernel isn't initialized
    // or if UI results are more recent (UI has mesh data)
    this.lastRebuildResult = rebuildResult;
    console.log(
      "[ChatController] Rebuild result updated from UI, sketches:",
      rebuildResult?.sketchSolveResults.size ?? 0,
      "bodies:",
      rebuildResult?.bodies.length ?? 0
    );
  }

  /**
   * Get the last rebuild result
   */
  getRebuildResult(): RebuildResult | null {
    return this.lastRebuildResult;
  }

  /**
   * Get the local KernelEngine instance.
   * May be null if kernel initialization failed or hasn't completed.
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 5
   */
  getKernelEngine(): KernelEngine | null {
    return this.kernelEngine;
  }

  /**
   * Stop the current run
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Get current state
   */
  getState(): ChatControllerState {
    return this.state;
  }

  /**
   * Check if ready to send messages
   */
  isReady(): boolean {
    return this.state === "ready";
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    console.log("[ChatController] Disposing:", this.sessionId);

    this.stop();

    // Clear rebuild timer
    if (this.rebuildDebounceTimer) {
      clearTimeout(this.rebuildDebounceTimer);
      this.rebuildDebounceTimer = null;
    }

    // Dispose kernel engine
    if (this.kernelEngine) {
      this.kernelEngine.dispose();
      this.kernelEngine = null;
      this.kernelInitialized = false;
    }

    if (this.docSync) {
      this.docSync.disconnect();
      this.docSync = null;
    }

    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }

    if (this.streamDb) {
      this.streamDb.close();
      this.streamDb = null;
    }

    this.wrappedDoc = null;
    this.documentSynced = false;
    this.lastRebuildResult = null;
  }
}
