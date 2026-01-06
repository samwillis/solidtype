/**
 * AI Chat SharedWorker
 *
 * Manages AI chat sessions using TanStack AI with Durable Streams transport.
 *
 * Architecture:
 * - Worker runs TanStack AI chat loop with custom Durable Stream adapter
 * - Client tools (sketch) execute in worker against synced Yjs document
 * - Server tools execute on server during chat() call
 * - Main thread delegates message sending to worker
 *
 * Key responsibilities:
 * - Session lifecycle (init, terminate, idle shutdown)
 * - Chat controller management (one per session)
 * - Run coordination across tabs
 * - CAD kernel initialization (for editor context)
 * - Broadcasting UI updates to main thread
 */

/// <reference lib="webworker" />

import { SolidSession, setOC } from "@solidtype/core";
import { initOCCTBrowser } from "../../../editor/worker/occt-init";
import { WorkerChatController } from "./worker-chat-controller";
import type { AIChatWorkerCommand, AIChatWorkerEvent } from "./types";

// Support both SharedWorker and Worker
declare const self: SharedWorkerGlobalScope | DedicatedWorkerGlobalScope;

/**
 * Extended session state with chat controller
 */
interface WorkerSessionState {
  sessionId: string;
  documentId?: string;
  projectId?: string;
  controller: WorkerChatController;
  kernelInitialized: boolean;
}

// Worker state
const sessions = new Map<string, WorkerSessionState>();
let kernelSession: SolidSession | null = null;
let kernelInitialized = false;
let initializationPromise: Promise<void> | null = null;

console.log("[AI Chat Worker] 🚀 Worker script loaded and executing");

// Connection management for SharedWorker
const ports = new Set<MessagePort>();

// Idle shutdown configuration
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
let lastActivity = Date.now();

// Check for idle shutdown periodically
const idleCheckInterval = setInterval(() => {
  if (ports.size === 0 && Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    console.log("[AI Chat Worker] Idle timeout, shutting down");

    // Clean up all sessions
    for (const session of sessions.values()) {
      session.controller.dispose();
    }
    sessions.clear();

    // Clean up kernel
    if (kernelSession) {
      kernelSession.dispose();
      kernelSession = null;
    }

    clearInterval(idleCheckInterval);
    self.close();
  }
}, 30_000);

/**
 * Broadcast an event to all connected ports
 */
function broadcast(event: AIChatWorkerEvent) {
  for (const port of ports) {
    try {
      port.postMessage(event);
    } catch (e) {
      console.error("[AI Chat Worker] Error posting to port:", e);
    }
  }
  // Also post to self if regular Worker (no ports)
  if (typeof self !== "undefined" && "postMessage" in self && ports.size === 0) {
    self.postMessage(event);
  }
}

/**
 * Initialize CAD kernel (lazy, only when needed for editor context)
 */
async function ensureKernelInitialized(): Promise<void> {
  if (kernelInitialized && kernelSession) {
    return;
  }

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    try {
      console.log("[AI Chat Worker] Initializing CAD kernel...");
      const oc = await initOCCTBrowser();
      setOC(oc);

      kernelSession = new SolidSession();
      await kernelSession.init();
      kernelInitialized = true;
      console.log("[AI Chat Worker] CAD kernel initialized");
    } catch (error) {
      console.error("[AI Chat Worker] Failed to initialize kernel:", error);
      throw error;
    }
  })();

  await initializationPromise;
}

/**
 * Handle commands from main thread
 */
async function handleCommand(command: AIChatWorkerCommand) {
  lastActivity = Date.now();

  try {
    switch (command.type) {
      case "init-session": {
        const { sessionId, documentId, projectId } = command;
        console.log("[AI Chat Worker] 📥 Received init-session:", {
          sessionId,
          documentId,
          projectId,
        });

        // Clean up existing session if re-initializing
        const existingSession = sessions.get(sessionId);
        if (existingSession) {
          existingSession.controller.dispose();
          sessions.delete(sessionId);
        }

        // Initialize kernel if we have a documentId (editor context)
        let kernelReady = false;
        if (documentId) {
          try {
            await ensureKernelInitialized();
            kernelReady = true;
            broadcast({ type: "kernel-initialized", sessionId });
          } catch (error) {
            console.error("[AI Chat Worker] Kernel init failed:", error);
            // Non-fatal - continue without kernel
          }
        }

        // Create chat controller
        const controller = new WorkerChatController({
          sessionId,
          documentId,
          projectId,
          broadcast,
        });

        // Store session
        const session: WorkerSessionState = {
          sessionId,
          documentId,
          projectId,
          controller,
          kernelInitialized: kernelReady,
        };
        sessions.set(sessionId, session);

        // Initialize controller (connects to streams, syncs document)
        try {
          await controller.initialize();
          // session-ready is broadcast by controller
        } catch (error) {
          console.error("[AI Chat Worker] Controller init failed:", error);
          broadcast({
            type: "session-error",
            sessionId,
            error: error instanceof Error ? error.message : "Initialization failed",
          });
        }
        break;
      }

      case "send-message": {
        const { sessionId, content } = command;
        const session = sessions.get(sessionId);

        if (!session) {
          broadcast({
            type: "run-rejected",
            sessionId,
            reason: "session-not-initialized",
          });
          return;
        }

        // Delegate to controller
        try {
          await session.controller.sendMessage(content);
        } catch (error) {
          broadcast({
            type: "run-error",
            sessionId,
            error: error instanceof Error ? error.message : "Send failed",
          });
        }
        break;
      }

      case "stop-run": {
        const { sessionId } = command;
        const session = sessions.get(sessionId);
        if (session) {
          session.controller.stop();
        }
        break;
      }

      case "set-active-sketch": {
        const { sessionId, sketchId } = command;
        const session = sessions.get(sessionId);
        if (session) {
          session.controller.setActiveSketchId(sketchId);
        }
        break;
      }

      // Legacy commands for backward compatibility
      case "start-run": {
        // Map to send-message
        console.warn("[AI Chat Worker] start-run is deprecated, use send-message");
        const { sessionId, content } = command;
        const session = sessions.get(sessionId);
        if (session) {
          try {
            await session.controller.sendMessage(content);
          } catch (error) {
            broadcast({
              type: "run-error",
              sessionId,
              error: error instanceof Error ? error.message : "Send failed",
            });
          }
        } else {
          broadcast({
            type: "run-rejected",
            sessionId,
            reason: "session-not-initialized",
          });
        }
        break;
      }

      case "run-complete": {
        // No longer needed - controller detects completion via Durable Stream
        console.warn("[AI Chat Worker] run-complete is deprecated");
        break;
      }

      case "execute-local-tool": {
        // No longer needed - tools executed via controller
        console.warn("[AI Chat Worker] execute-local-tool is deprecated");
        const { toolName, sessionId } = command;
        broadcast({
          type: "tool-result",
          sessionId,
          toolName,
          error: "execute-local-tool is deprecated",
        });
        break;
      }

      case "terminate-session": {
        const { sessionId } = command;
        const session = sessions.get(sessionId);

        if (session) {
          session.controller.dispose();
          sessions.delete(sessionId);
        }

        // Cleanup kernel if no sessions remain
        if (sessions.size === 0 && kernelSession) {
          kernelSession.dispose();
          kernelSession = null;
          kernelInitialized = false;
          initializationPromise = null;
        }
        break;
      }

      case "ping": {
        broadcast({ type: "pong" });
        break;
      }
    }
  } catch (error) {
    console.error("[AI Chat Worker] Error handling command:", error);
    broadcast({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      sessionId: "sessionId" in command ? command.sessionId : undefined,
    });
  }
}

// SharedWorker connection handler
console.log("[AI Chat Worker] Checking for SharedWorker context:", {
  hasSelf: typeof self !== "undefined",
  hasOnconnect: typeof self !== "undefined" && "onconnect" in self,
});

if (typeof self !== "undefined" && "onconnect" in self) {
  console.log("[AI Chat Worker] 🎯 Setting up SharedWorker onconnect handler");
  (self as SharedWorkerGlobalScope).onconnect = (e: MessageEvent) => {
    console.log("[AI Chat Worker] 🔗 New connection received!");
    const port = e.ports[0];
    ports.add(port);
    console.log("[AI Chat Worker] Total connected ports:", ports.size);

    port.onmessage = (msg: MessageEvent<AIChatWorkerCommand>) => {
      console.log("[AI Chat Worker] 📨 Received command:", msg.data.type);
      handleCommand(msg.data);
    };

    port.onmessageerror = (error) => {
      console.error("[AI Chat Worker] Port message error:", error);
      ports.delete(port);
    };

    port.start();

    // Send current state to new connection
    for (const session of sessions.values()) {
      port.postMessage({
        type: "session-ready",
        sessionId: session.sessionId,
      } as AIChatWorkerEvent);
      if (session.kernelInitialized) {
        port.postMessage({
          type: "kernel-initialized",
          sessionId: session.sessionId,
        } as AIChatWorkerEvent);
      }
    }
  };
} else {
  // Regular Worker fallback
  (self as DedicatedWorkerGlobalScope).onmessage = (msg: MessageEvent<AIChatWorkerCommand>) => {
    handleCommand(msg.data);
  };
}

console.log("[AI Chat Worker] Worker initialized (Durable Stream transport)");
