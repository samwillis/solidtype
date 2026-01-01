/**
 * Yjs document sync utilities
 *
 * Connects Yjs documents to Durable Streams for persistence and sync.
 */

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { DurableStreamsProvider } from "./vendor/y-durable-streams";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

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
