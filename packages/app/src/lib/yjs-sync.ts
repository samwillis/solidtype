/**
 * Yjs document sync utilities
 *
 * Connects Yjs documents to Durable Streams for persistence and sync.
 */

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { DurableStreamsProvider } from "@durable-streams/y-durable-streams";

/**
 * Get the API base URL
 * Works in both main thread (window) and workers (self)
 */
function getApiBase(): string {
  // Check for window (main thread)
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  // Check for self (workers - SharedWorker, Worker, ServiceWorker)
  if (typeof self !== "undefined" && self.location?.origin) {
    return self.location.origin;
  }
  // Fallback for SSR/Node
  return "http://localhost:3000";
}

const API_BASE = getApiBase();

/**
 * Create sync providers for a document
 *
 * Uses DurableStreamsProvider from y-durable-streams which handles both
 * document sync and awareness (presence) in a single provider.
 */
export function createDocumentSync(documentId: string, doc: Y.Doc) {
  // Simple URLs - auth and project lookup happen server-side
  const streamUrl = `${API_BASE}/api/docs/${documentId}/stream`;
  const awarenessUrl = `${API_BASE}/api/docs/${documentId}/awareness`;

  const awareness = new Awareness(doc);

  console.log("[yjs-sync] Creating provider for document:", documentId);
  console.log("[yjs-sync] Document stream URL:", streamUrl);
  console.log("[yjs-sync] Awareness stream URL:", awarenessUrl);

  // Create the unified provider for both document and awareness
  const provider = new DurableStreamsProvider({
    doc,
    documentStream: {
      url: streamUrl,
    },
    awarenessStream: {
      url: awarenessUrl,
      protocol: awareness,
    },
    connect: false, // We'll connect manually
  });

  // Add debug listeners
  provider.on("synced", (synced: boolean) => {
    console.log("[yjs-sync] Synced event:", synced);
  });
  provider.on("status", (status: string) => {
    console.log("[yjs-sync] Status event:", status);
  });
  provider.on("error", (error: Error) => {
    console.error("[yjs-sync] Error event:", error);
  });

  return {
    doc,
    awareness,
    provider,

    /** Whether the provider is synced with the server */
    get synced() {
      return provider.synced;
    },

    /** Whether the provider is connected */
    get connected() {
      return provider.connected;
    },

    /** Connect to the durable streams */
    connect: () => provider.connect(),

    /** Disconnect from the durable streams */
    disconnect: () => provider.disconnect(),

    /** Clean up all resources */
    destroy: () => provider.destroy(),

    /** Listen for sync state changes */
    onSynced: (callback: (synced: boolean) => void) => {
      provider.on("synced", callback);
      return () => provider.off("synced", callback);
    },

    /** Listen for connection status changes */
    onStatus: (callback: (status: "disconnected" | "connecting" | "connected") => void) => {
      provider.on("status", callback);
      return () => provider.off("status", callback);
    },

    /** Listen for errors */
    onError: (callback: (error: Error) => void) => {
      provider.on("error", callback);
      return () => provider.off("error", callback);
    },
  };
}

/**
 * Document sync instance type
 */
export type DocumentSync = ReturnType<typeof createDocumentSync>;
