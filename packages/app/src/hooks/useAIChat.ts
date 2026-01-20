/**
 * AI Chat Hook
 *
 * Hook for managing AI chat UI state with Durable State persistence.
 * Uses live queries to subscribe to chat transcript updates across tabs.
 *
 * Architecture:
 * - StreamDB provides live queries over Durable Streams
 * - Messages and chunks are hydrated into a complete transcript
 * - Runs are coordinated via SharedWorker to prevent conflicts
 * - All state survives page refresh and is synced across tabs
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useAuth } from "./useAuth";
import { createChatStreamDB, type ChatStreamDB } from "../lib/ai/state/db";
import { hydrateFromArrays } from "../lib/ai/state/hydrate";
import {
  approveToolCall as approveToolCallState,
  rejectToolCall as rejectToolCallState,
} from "../lib/ai/state/tool-approval";
import type { Run } from "../lib/ai/state/schema";
import { aiChatSessionsCollection } from "../lib/electric-collections";
import { createChatSessionDirect } from "../lib/server-functions";

/**
 * Camel-case session type (converted from snake_case DB schema)
 */
interface CamelCaseSession {
  id: string;
  userId: string;
  context: "dashboard" | "editor";
  documentId: string | null;
  projectId: string | null;
  status: "active" | "archived" | "error";
  title: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  durableStreamId: string | null;
  createdAt: string;
  updatedAt: string;
}
import { getAIChatWorkerClient } from "../lib/ai/runtime/ai-chat-worker-client";

interface UseAIChatOptions {
  context: "dashboard" | "editor";
  documentId?: string;
  projectId?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system" | "error";
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolCallId?: string;
  toolResult?: unknown;
  requiresApproval?: boolean;
  status?: string;
}

interface ToolApprovalRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  messageId: string;
}

/**
 * Hook for managing chat session list (metadata from PostgreSQL via TanStack DB collection)
 */
export function useAIChatSessions(options: { context?: "dashboard" | "editor" }) {
  // Query sessions from TanStack DB collection (synced via Electric)
  // Uses live query with orderBy for sorting and select for field transformation
  const sessionsQuery = useLiveQuery((q) =>
    q
      .from({ s: aiChatSessionsCollection as any })
      .orderBy(({ s }) => s.updated_at, "desc")
      .select(({ s }) => ({
        id: s.id,
        userId: s.user_id,
        context: s.context,
        documentId: s.document_id,
        projectId: s.project_id,
        status: s.status,
        title: s.title,
        messageCount: s.message_count,
        lastMessageAt: s.last_message_at,
        durableStreamId: s.durable_stream_id,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }))
  );

  // Sessions are now sorted and transformed by the live query
  const sessions: CamelCaseSession[] = (sessionsQuery.data || []) as CamelCaseSession[];

  const createSession = useCallback(
    async (data: { title?: string; documentId?: string; projectId?: string }) => {
      // Insert into collection - mutation handler will call server function
      // Generate ID client-side (server will use it or generate new one)
      const sessionId = crypto.randomUUID();
      await aiChatSessionsCollection.insert({
        id: sessionId,
        context: options.context || "dashboard",
        user_id: "", // Will be overridden by server
        document_id: data.documentId || null,
        project_id: data.projectId || null,
        title: data.title || "New Chat",
        status: "active",
        message_count: 0,
        last_message_at: null,
        durable_stream_id: null, // Will be set by server
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      // Return the created session (collection will sync it)
      const created = sessions.find((s) => s.id === sessionId);
      if (!created) {
        // If not found yet, return a temporary object (will be synced)
        return {
          id: sessionId,
          userId: "",
          context: (options.context || "dashboard") as "dashboard" | "editor",
          documentId: data.documentId || null,
          projectId: data.projectId || null,
          status: "active" as const,
          title: data.title || "New Chat",
          messageCount: 0,
          lastMessageAt: null,
          durableStreamId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return created;
    },
    [options.context, sessions]
  );

  const archiveSession = useCallback(
    async (sessionId: string) => {
      const session = sortedSessions.find((s) => s.id === sessionId);
      if (!session) return;
      // Update via collection - mutation handler will call server function
      await aiChatSessionsCollection.update(sessionId, (draft) => {
        draft.status = "archived";
        draft.updated_at = new Date().toISOString();
      });
    },
    [sortedSessions]
  );

  const unarchiveSession = useCallback(
    async (sessionId: string) => {
      const session = sortedSessions.find((s) => s.id === sessionId);
      if (!session) return;
      // Update via collection - mutation handler will call server function
      await aiChatSessionsCollection.update(sessionId, (draft) => {
        draft.status = "active";
        draft.updated_at = new Date().toISOString();
      });
    },
    [sortedSessions]
  );

  const deleteSession = useCallback(async (sessionId: string) => {
    // Delete via collection - mutation handler will call server function
    await aiChatSessionsCollection.delete(sessionId);
  }, []);

  return {
    sessions,
    isLoading: sessionsQuery.isLoading,
    isSuccess: !sessionsQuery.isLoading && sessionsQuery.data !== undefined,
    createSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
    refetch: () => {}, // Collections auto-sync, no manual refetch needed
  };
}

/**
 * Main chat hook - uses Durable State for persistence and live queries
 *
 * Session creation is LAZY - no session is created until the user sends their first message.
 * This prevents creating empty sessions just by opening the chat UI.
 */
export function useAIChat(options: UseAIChatOptions) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeSessionId, setActiveSessionIdRaw] = useState<string | null>(null);
  const [streamDb, setStreamDb] = useState<ChatStreamDB | null>(null);
  // Track which session the current streamDb belongs to
  // This ensures we don't show cached data from wrong session
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Wrapper around setActiveSessionId to log all transitions for debugging
  const setActiveSessionId = useCallback((newId: string | null, source?: string) => {
    setActiveSessionIdRaw((prev) => {
      console.log(`[setActiveSessionId] ${prev} → ${newId} (source: ${source || "unknown"})`);
      return newId;
    });
  }, []);

  // Live query on StreamDB collections - automatically updates when data changes
  // IMPORTANT: Include streamDb in dependency array so useLiveQuery re-subscribes on session change
  // Without the dependency array, useLiveQuery doesn't know when the collection changes
  //
  // TODO(agent): Consider using TanStack DB joins once @durable-streams/state collections are
  // fully compatible with TanStack DB's query builder. Currently we fetch messages and chunks
  // separately and join them in hydrateFromArrays() because:
  //
  // 1. StreamDB collections may not be fully compatible with q.from({...}).leftJoin({...})
  // 2. TanStack DB lacks a string aggregation function (like SQL's string_agg or group_concat)
  //    needed to concatenate chunk.delta values sorted by seq for each message
  //
  // If TanStack DB adds collect() or stringAgg() aggregate functions, we could potentially:
  //   q.from({ m: messagesCollection })
  //    .leftJoin({ c: chunksCollection }, ({ m, c }) => eq(m.id, c.messageId))
  //    .groupBy(({ m }) => m.id)
  //    .select(({ m, c }) => ({ ...m, content: stringAgg(c.delta, orderBy(c.seq)) }))
  //
  const { data: rawMessagesData } = useLiveQuery(
    (_q) => (streamDb ? streamDb.collections.messages : null),
    [streamDb]
  );
  const { data: rawChunksData } = useLiveQuery(
    (_q) => (streamDb ? streamDb.collections.chunks : null),
    [streamDb]
  );
  const { data: rawRunsData } = useLiveQuery(
    (_q) => (streamDb ? streamDb.collections.runs : null),
    [streamDb]
  );

  // Only use data if it's from the correct session
  // This prevents showing stale data from previous session while loading new one
  const messagesData = loadedSessionId === activeSessionId ? rawMessagesData : undefined;
  const chunksData = loadedSessionId === activeSessionId ? rawChunksData : undefined;
  const runsData = loadedSessionId === activeSessionId ? rawRunsData : undefined;

  const {
    sessions,
    isLoading: sessionsLoading,
    isSuccess: sessionsLoaded,
    createSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
  } = useAIChatSessions({ context: options.context });

  // Find existing active session for this context on initial load (but don't create one)
  // Only run once when sessions first load - uses ref to prevent re-running
  const initialSessionSet = useRef(false);
  useEffect(() => {
    // CRITICAL: Only run ONCE on initial load
    // Don't re-run when sessions array updates (which happens frequently via Electric sync)
    if (!initialSessionSet.current && sessionsLoaded && sessions.length > 0) {
      initialSessionSet.current = true;
      // Look for an existing active session matching the context
      const existingSession = sessions.find(
        (s) =>
          s.status === "active" &&
          (options.context === "editor"
            ? s.documentId === options.documentId
            : s.context === "dashboard")
      );
      if (existingSession) {
        console.log("[useAIChat init] Setting initial session to:", existingSession.id);
        setActiveSessionId(existingSession.id, "initial-load");
      } else {
        console.log("[useAIChat init] No existing session, staying in new chat mode");
      }
    }
  }, [sessionsLoaded, sessions, options.context, options.documentId]);

  // Validate activeSessionId - reset if session is archived
  // This handles race conditions where Electric sync updates session status after we select it
  // NOTE: We only reset if the session EXISTS and is archived, not if it's missing
  // (missing could mean a newly created session that hasn't synced yet)
  useEffect(() => {
    if (!activeSessionId || !sessionsLoaded) return;

    const currentSession = sessions.find((s) => s.id === activeSessionId);

    // Only invalidate if the session exists AND is archived
    // Don't invalidate if session is not found - it might be a newly created session pending sync
    if (currentSession && currentSession.status === "archived") {
      console.log("[useAIChat] Active session is archived, resetting:", activeSessionId);
      setActiveSessionId(null, "session-invalidated");
    }
  }, [activeSessionId, sessions, sessionsLoaded, setActiveSessionId]);

  // Get or create active session (called lazily on first message)
  const ensureSession = useCallback(async () => {
    if (!sessionsLoaded) {
      throw new Error("Sessions not loaded yet");
    }

    // If we already have an active session, return it
    if (activeSessionId) {
      const existing = sessions.find((s) => s.id === activeSessionId);
      if (existing) return existing;
    }

    // Find existing active session for this context
    const activeSession = sessions.find(
      (s) =>
        s.status === "active" &&
        (options.context === "editor"
          ? s.documentId === options.documentId
          : s.context === "dashboard")
    );

    if (activeSession) {
      setActiveSessionId(activeSession.id, "ensureSession-found");
      return activeSession;
    }

    // Create new session only when actually needed
    const newSession = await createSession({
      documentId: options.documentId,
      projectId: options.projectId,
    });
    setActiveSessionId(newSession.id, "ensureSession-created");
    return newSession;
  }, [
    sessions,
    sessionsLoaded,
    activeSessionId,
    options.documentId,
    options.projectId,
    options.context,
    createSession,
  ]);

  // Create StreamDB when session changes
  // Live queries (above) will automatically update when StreamDB collections change
  useEffect(() => {
    console.debug("[useAIChat effect] activeSessionId changed to:", activeSessionId);

    // IMMEDIATELY clear the old streamDb so UI doesn't show stale data
    // This ensures messages show as empty while loading the new session
    setStreamDb(null);
    setLoadedSessionId(null);

    if (!activeSessionId) {
      console.debug("[useAIChat effect] No activeSessionId, done");
      return;
    }

    let db: ChatStreamDB | null = null;
    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 500; // 500ms between retries

    const tryPreload = async (): Promise<boolean> => {
      if (cancelled) return false;

      try {
        await db!.preload();
        return true;
      } catch (err) {
        // If we get a 403, it might be because the session doesn't exist
        // or belongs to another user. After retries, clear the session.
        const is403 = err instanceof Error && err.message.includes("403");
        if (is403 && retryCount < MAX_RETRIES) {
          retryCount++;
          console.debug(
            `[useAIChat] StreamDB preload failed (attempt ${retryCount}/${MAX_RETRIES}), retrying...`
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
          return tryPreload();
        }
        throw err;
      }
    };

    // Capture the session ID this effect is loading for
    const sessionBeingLoaded = activeSessionId;

    (async () => {
      console.debug("[useAIChat effect] Creating StreamDB for:", sessionBeingLoaded);
      db = createChatStreamDB(sessionBeingLoaded);

      try {
        await tryPreload();
        if (!cancelled) {
          // Debug: Log what we got from preload
          const messagesCount = Array.from(db.collections.messages.values()).length;
          const chunksCount = Array.from(db.collections.chunks.values()).length;
          const runsCount = Array.from(db.collections.runs.values()).length;
          console.debug("[useAIChat effect] StreamDB preloaded:", {
            session: sessionBeingLoaded,
            messages: messagesCount,
            chunks: chunksCount,
            runs: runsCount,
          });
          // Once preloaded, set the streamDb and mark which session it belongs to
          setStreamDb(db);
          setLoadedSessionId(sessionBeingLoaded);
        } else {
          console.debug("[useAIChat effect] Cancelled before setting streamDb, closing db");
          db?.close();
        }
      } catch (err) {
        console.error("[useAIChat] Failed to preload StreamDB:", err);

        // Don't reset activeSessionId on 403 - user explicitly chose this session
        // Just set error state and let them retry or switch manually
        const is403 = err instanceof Error && err.message.includes("403");
        if (is403 && !cancelled) {
          console.warn("[useAIChat] Session preload failed with 403, keeping session selected");
          setError(new Error("Failed to load chat history"));
        }
        // Set the db anyway for degraded mode (messages may not load but session stays selected)
        if (!cancelled && db) {
          setStreamDb(db);
          setLoadedSessionId(sessionBeingLoaded);
        }
      }
    })();

    return () => {
      console.debug(
        "[useAIChat effect cleanup] Cancelling and closing db for:",
        sessionBeingLoaded
      );
      cancelled = true;
      db?.close();
    };
  }, [activeSessionId]);

  // Initialize session in worker when it becomes active
  // Each session gets its own SharedWorker for complete isolation
  // Note: We intentionally exclude `sessions` from deps to avoid re-running
  // when the sessions list updates (which causes terminate/init race conditions)
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!activeSessionId) return;

    const workerClient = getAIChatWorkerClient(activeSessionId);
    const session = sessionsRef.current.find((s) => s.id === activeSessionId);

    // Only initialize if we have session details
    // For new sessions, sendMessage will initialize with the correct options
    if (session) {
      console.debug("[useAIChat] Initializing worker for session:", activeSessionId);
      workerClient
        .initSession(activeSessionId, {
          documentId: session.documentId || undefined,
          projectId: session.projectId || undefined,
        })
        .catch((error) => {
          console.error("Failed to initialize session in worker:", error);
          // Non-fatal - worker initialization can fail gracefully
        });
    }

    // Cleanup on unmount or session change
    return () => {
      console.debug("[useAIChat] Terminating worker session:", activeSessionId);
      workerClient.terminateSession(activeSessionId).catch(() => {
        // Ignore cleanup errors
      });
      // Note: Don't dispose the client here - the SharedWorker will self-terminate
      // after idle timeout, and other tabs may still be using it
    };
  }, [activeSessionId]); // Only re-run when activeSessionId changes

  // Hydrate transcript from messages and chunks
  // Live queries return arrays or undefined when collection not available
  const transcript = useMemo(() => {
    if (!messagesData || !chunksData) return [];
    return hydrateFromArrays(messagesData, chunksData);
  }, [messagesData, chunksData]);

  // Convert hydrated transcript to ChatMessage format for UI compatibility
  const messages: ChatMessage[] = useMemo(() => {
    return transcript.map((m) => ({
      id: m.id,
      role: m.role === "tool_call" || m.role === "tool_result" ? "tool" : m.role,
      content: m.content,
      toolName: m.toolName,
      toolArgs: m.toolArgs,
      toolCallId: m.toolCallId,
      toolResult: m.toolResult,
      requiresApproval: m.requiresApproval,
      status: m.status,
    }));
  }, [transcript]);

  // Log tool call errors to console for debugging
  const loggedErrorsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of transcript) {
      // Skip if we've already logged this error
      if (loggedErrorsRef.current.has(m.id)) continue;

      // Log tool calls with error status
      if (m.role === "tool_call" && m.status === "error") {
        console.warn("[AI Tool Call Error]", {
          messageId: m.id,
          toolName: m.toolName,
          toolCallId: m.toolCallId,
          toolArgs: m.toolArgs,
        });
        loggedErrorsRef.current.add(m.id);
      }

      // Log tool results that contain errors
      if (m.role === "tool_result" && m.toolResult) {
        const result = m.toolResult as Record<string, unknown>;
        if (result.error) {
          console.warn("[AI Tool Result Error]", {
            messageId: m.id,
            toolCallId: m.toolCallId,
            error: result.error,
          });
          loggedErrorsRef.current.add(m.id);
        }
      }
    }
  }, [transcript]);

  // Check if there's an active run
  const activeRun = useMemo(() => {
    if (!runsData) return undefined;
    return runsData.find((r) => r.status === "running");
  }, [runsData]);

  const isStreaming = activeRun !== undefined;

  // Track previous run state for debugging
  // Note: Worker now detects completion via Durable Stream, no notification needed
  const prevActiveRun = useRef<Run | undefined>();
  useEffect(() => {
    if (prevActiveRun.current && !activeRun && activeSessionId) {
      console.debug("[useAIChat] Run completed:", prevActiveRun.current.id);
    }
    prevActiveRun.current = activeRun;
  }, [activeRun, activeSessionId]);

  // Poll streamDb while loading/streaming to ensure we get updates
  // This is a fallback in case the live subscription doesn't work
  useEffect(() => {
    if (!streamDb || (!isLoading && !isStreaming)) return;

    const poll = async () => {
      try {
        await streamDb.preload();
      } catch (err) {
        console.debug("[useAIChat] Poll preload failed:", err);
      }
    };

    // Poll every 200ms while loading/streaming
    const interval = setInterval(poll, 200);

    // Also poll immediately
    poll();

    return () => clearInterval(interval);
  }, [streamDb, isLoading, isStreaming]);

  // Computed ready state - ready to send messages (session will be created on first send)
  const isReady = isAuthenticated && sessionsLoaded;

  const sendMessage = useCallback(
    async (content: string) => {
      if (!isAuthenticated) {
        throw new Error("Not authenticated");
      }

      if (!sessionsLoaded) {
        throw new Error("Sessions not loaded yet");
      }

      setIsLoading(true);
      setError(null);

      try {
        // Ensure we have a session before sending
        let sessionId = activeSessionId;

        if (!sessionId) {
          // We're in "New Chat" mode - always create a NEW session
          // Don't reuse existing sessions - user explicitly wanted a new chat
          console.debug("[useAIChat] Creating new session via direct server call...");
          const newSession = await createChatSessionDirect({
            data: {
              context: options.context,
              documentId: options.documentId,
              projectId: options.projectId,
            },
          });
          sessionId = newSession.id;
          setActiveSessionId(sessionId, "sendMessage-created");
          console.debug("[useAIChat] Session created:", sessionId);
        }

        // Delegate to worker - it handles:
        // - POSTing to /run (cookies DO work in SharedWorkers for same-origin)
        // - Streaming chunks from Durable Stream
        // - Executing client tools (sketch operations) against synced Yjs doc
        const workerClient = getAIChatWorkerClient(sessionId);
        console.debug("[useAIChat] Sending message via worker:", {
          sessionId,
          contentLength: content.length,
        });

        await workerClient.sendMessage(sessionId, content, {
          documentId: options.documentId,
          projectId: options.projectId,
        });

        console.debug("[useAIChat] Worker reported run completed");

        // Keep isLoading = true for a bit to allow polling to fetch the messages
        // This handles the race where StreamDB isn't created yet when worker finishes
        await new Promise((r) => setTimeout(r, 500));

        // UI should now have the data via live queries
      } catch (err) {
        console.error("AI chat error:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeSessionId,
      isAuthenticated,
      sessionsLoaded,
      options.context,
      options.documentId,
      options.projectId,
      setActiveSessionId,
    ]
  );

  // Derive pending tool approvals from messages
  const pendingToolApprovals: ToolApprovalRequest[] = useMemo(() => {
    if (!messagesData) return [];
    return messagesData
      .filter(
        (m) => m.role === "tool_call" && m.status === "pending" && m.requiresApproval === true
      )
      .map((m) => ({
        id: m.toolCallId || m.id,
        name: m.toolName || "",
        arguments: (m.toolArgs as Record<string, unknown>) || {},
        messageId: m.id,
      }));
  }, [messagesData]);

  // Tool approval handlers - update state via Durable State
  const approveToolCall = useCallback(
    async (messageId: string) => {
      if (!streamDb) {
        console.error("Cannot approve tool call: StreamDB not initialized");
        return;
      }
      try {
        await approveToolCallState(streamDb, messageId);
      } catch (err) {
        console.error("Failed to approve tool call:", err);
        setError(err instanceof Error ? err : new Error("Failed to approve tool call"));
      }
    },
    [streamDb]
  );

  const rejectToolCall = useCallback(
    async (messageId: string) => {
      if (!streamDb) {
        console.error("Cannot reject tool call: StreamDB not initialized");
        return;
      }
      try {
        await rejectToolCallState(streamDb, messageId);
      } catch (err) {
        console.error("Failed to reject tool call:", err);
        setError(err instanceof Error ? err : new Error("Failed to reject tool call"));
      }
    },
    [streamDb]
  );

  // Start new chat - clears active session, live queries will return empty
  const startNewChat = useCallback(() => {
    console.log("[startNewChat] Starting new chat");
    // Just set activeSessionId to null - the effect will handle closing StreamDB
    setActiveSessionId(null, "startNewChat");
    setError(null);
    // Live queries will automatically return null/empty when streamDb is null
  }, [setActiveSessionId]);

  // Switch to existing session (unarchives if needed)
  const switchToSession = useCallback(
    async (sessionId: string) => {
      console.log("[switchToSession] Called with:", sessionId, "current:", activeSessionId);

      // Don't switch to already active session
      if (sessionId === activeSessionId) {
        console.log("[switchToSession] Already active, skipping");
        return;
      }

      const session = sessions.find((s) => s.id === sessionId);
      console.log("[switchToSession] Found session:", session?.id, session?.title);

      if (!session) {
        console.warn("[switchToSession] Session not found in list");
        return;
      }

      // If session is archived, unarchive it first
      if (session.status === "archived") {
        console.log("[switchToSession] Unarchiving session");
        await unarchiveSession(sessionId);
      }

      // Just update the activeSessionId - the effect will handle closing old
      // StreamDB and creating new one
      setActiveSessionId(sessionId, "switchToSession");
      setError(null);
      console.log("[switchToSession] Switched to:", sessionId);
    },
    [sessions, unarchiveSession, activeSessionId, setActiveSessionId]
  );

  // Archive session and switch away if it was active
  const handleArchiveSession = useCallback(
    async (sessionId: string) => {
      console.log("[handleArchiveSession] Archiving:", sessionId);
      // If archiving the active session, switch away FIRST
      if (activeSessionId === sessionId) {
        const remainingActive = sessions.find((s) => s.id !== sessionId && s.status === "active");
        if (remainingActive) {
          console.log("[handleArchiveSession] Switching to:", remainingActive.id);
          setActiveSessionId(remainingActive.id, "archive-switch");
        } else {
          console.log("[handleArchiveSession] No remaining active, starting new chat");
          setActiveSessionId(null, "archive-newchat");
        }
        setError(null);
      }
      // Then archive
      await archiveSession(sessionId);
    },
    [archiveSession, activeSessionId, sessions, setActiveSessionId]
  );

  // Delete session permanently and switch away if it was active
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      console.log("[handleDeleteSession] Deleting:", sessionId);
      // If deleting the active session, switch away FIRST
      if (activeSessionId === sessionId) {
        const remainingActive = sessions.find((s) => s.id !== sessionId && s.status === "active");
        if (remainingActive) {
          console.log("[handleDeleteSession] Switching to:", remainingActive.id);
          setActiveSessionId(remainingActive.id, "delete-switch");
        } else {
          console.log("[handleDeleteSession] No remaining active, starting new chat");
          setActiveSessionId(null, "delete-newchat");
        }
        setError(null);
      }
      // Then delete
      await deleteSession(sessionId);
    },
    [deleteSession, activeSessionId, sessions, setActiveSessionId]
  );

  return {
    // Chat state
    messages,
    isLoading: isLoading || isStreaming,
    error,
    // Auth state
    isAuthenticated,
    isReady,
    // Session management
    sessions,
    sessionsLoading: sessionsLoading || authLoading,
    activeSessionId,
    // Tool approval
    toolApprovalRequests: pendingToolApprovals,
    approveToolCall,
    rejectToolCall,
    // Actions
    sendMessage,
    startNewChat,
    switchToSession,
    archiveSession: handleArchiveSession,
    deleteSession: handleDeleteSession,
    ensureSession,
  };
}
