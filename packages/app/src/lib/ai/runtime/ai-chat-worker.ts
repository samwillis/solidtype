/**
 * AI Chat SharedWorker
 *
 * Manages local session state and CAD kernel instance for local tool execution.
 * LLM calls remain server-side, this worker handles:
 * - Session state management
 * - CAD kernel initialization (for editor context)
 * - Local tool execution (Phase 25/26)
 */

/// <reference lib="webworker" />

import { SolidSession, setOC } from "@solidtype/core";
import { initOCCTBrowser } from "../../../editor/worker/occt-init";
import type { AIChatWorkerCommand, AIChatWorkerEvent, AIChatSessionState } from "./types";

// Support both SharedWorker and Worker
declare const self: SharedWorkerGlobalScope | DedicatedWorkerGlobalScope;

// Worker state
const sessions = new Map<string, AIChatSessionState>();
let kernelSession: SolidSession | null = null;
let kernelInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Connection management for SharedWorker
const ports = new Set<MessagePort>();

function broadcast(event: AIChatWorkerEvent) {
  for (const port of ports) {
    try {
      port.postMessage(event);
    } catch (e) {
      console.error("[AI Chat Worker] Error posting to port:", e);
    }
  }
  // Also post to self if regular Worker
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
  try {
    switch (command.type) {
      case "init-session": {
        const { sessionId, documentId, projectId } = command;
        sessions.set(sessionId, {
          sessionId,
          documentId,
          projectId,
          kernelInitialized: false,
        });

        // Initialize kernel if we have a documentId (editor context)
        if (documentId) {
          await ensureKernelInitialized();
          const session = sessions.get(sessionId);
          if (session) {
            session.kernelInitialized = true;
          }
          broadcast({ type: "kernel-initialized", sessionId });
        }

        broadcast({ type: "session-ready", sessionId });
        break;
      }

      case "execute-local-tool": {
        // For Phase 25/26 - execute CAD operations in worker kernel
        if (!kernelInitialized || !kernelSession) {
          await ensureKernelInitialized();
        }

        // TODO: Implement tool execution when editor tools are added
        broadcast({
          type: "tool-result",
          toolName: command.toolName,
          result: { message: "Local tool execution not yet implemented" },
        });
        break;
      }

      case "terminate-session": {
        const { sessionId } = command;
        sessions.delete(sessionId);

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
      sessionId: command.type === "init-session" ? command.sessionId : undefined,
    });
  }
}

// SharedWorker connection handler
if (typeof self !== "undefined" && "onconnect" in self) {
  (self as SharedWorkerGlobalScope).onconnect = (e: MessageEvent) => {
    const port = e.ports[0];
    ports.add(port);

    port.onmessage = (msg: MessageEvent<AIChatWorkerCommand>) => {
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

console.log("[AI Chat Worker] Worker initialized");
