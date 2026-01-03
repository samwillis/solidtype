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
import type { Message, Chunk, Run } from "../lib/ai/state/schema";
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
  const sessionsQuery = useLiveQuery(() => aiChatSessionsCollection);

  // Filter and transform collection rows (snake_case from DB → camelCase for app)
  const allSessions = sessionsQuery.data || [];
  const filteredSessions = options.context
    ? allSessions.filter((row) => row.context === options.context)
    : allSessions;

  // Sort by updated_at descending
  const sortedSessions = [...filteredSessions].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  // Transform to camelCase for compatibility
  const sessions: CamelCaseSession[] = sortedSessions.map((row) => ({
    id: row.id,
    userId: row.user_id,
    context: row.context,
    documentId: row.document_id,
    projectId: row.project_id,
    status: row.status,
    title: row.title,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    durableStreamId: row.durable_stream_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streamDb, setStreamDb] = useState<ChatStreamDB | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track messages and chunks from StreamDB
  const [messagesData, setMessagesData] = useState<Message[]>([]);
  const [chunksData, setChunksData] = useState<Chunk[]>([]);
  const [runsData, setRunsData] = useState<Run[]>([]);

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
  // Only run once when sessions first load
  const initialSessionSet = useRef(false);
  useEffect(() => {
    if (sessionsLoaded && !initialSessionSet.current) {
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
        setActiveSessionId(existingSession.id);
      }
      // If no existing session, stay in "new chat" mode (activeSessionId = null)
    }
  }, [sessionsLoaded, sessions, options.context, options.documentId]);

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
      setActiveSessionId(activeSession.id);
      return activeSession;
    }

    // Create new session only when actually needed
    const newSession = await createSession({
      documentId: options.documentId,
      projectId: options.projectId,
    });
    setActiveSessionId(newSession.id);
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
  useEffect(() => {
    if (!activeSessionId) {
      setStreamDb(null);
      setMessagesData([]);
      setChunksData([]);
      setRunsData([]);
      return;
    }

    let db: ChatStreamDB | null = null;
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 500; // 500ms between retries

    const updateState = () => {
      if (cancelled || !db) return;
      setMessagesData(Array.from(db.collections.messages.values()));
      setChunksData(Array.from(db.collections.chunks.values()));
      setRunsData(Array.from(db.collections.runs.values()));
    };

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

    (async () => {
      db = createChatStreamDB(activeSessionId);

      try {
        await tryPreload();
        if (!cancelled) {
          setStreamDb(db);
          updateState();

          // Poll for updates while the session is active
          pollInterval = setInterval(() => {
            if (!cancelled && db) {
              updateState();
            }
          }, 100);
        }
      } catch (err) {
        console.error("[useAIChat] Failed to preload StreamDB:", err);

        // If we get 403 after all retries, the session is invalid
        // Clear it so the user can start fresh
        const is403 = err instanceof Error && err.message.includes("403");
        if (is403 && !cancelled) {
          console.warn("[useAIChat] Session appears invalid (403), clearing...");
          setActiveSessionId(null);
          setStreamDb(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      db?.close();
    };
  }, [activeSessionId]);

  // Initialize session in worker when it becomes active
  useEffect(() => {
    if (!activeSessionId) return;

    const workerClient = getAIChatWorkerClient();
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session) {
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
      workerClient.terminateSession(activeSessionId).catch(() => {
        // Ignore cleanup errors
      });
    };
  }, [activeSessionId, sessions]);

  // Hydrate transcript from messages and chunks
  const transcript = useMemo(() => {
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

  // Check if there's an active run
  const activeRun = useMemo(() => {
    return runsData.find((r) => r.status === "running");
  }, [runsData]);

  const isStreaming = activeRun !== undefined;

  // Notify worker when run completes
  const prevActiveRun = useRef<Run | undefined>();
  useEffect(() => {
    if (prevActiveRun.current && !activeRun && activeSessionId) {
      // Run just completed
      const workerClient = getAIChatWorkerClient();
      workerClient.notifyRunComplete(activeSessionId);
    }
    prevActiveRun.current = activeRun;
  }, [activeRun, activeSessionId]);

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
          // Check if there's already an active session in the list
          const existingSession = sessions.find(
            (s) =>
              s.status === "active" &&
              (options.context === "editor"
                ? s.documentId === options.documentId
                : s.context === "dashboard")
          );

          if (existingSession) {
            sessionId = existingSession.id;
            setActiveSessionId(sessionId);
          } else {
            // Create a new session using the direct server function
            // This is synchronous - it waits for the server to create the session
            // before returning, avoiding race conditions with Electric sync
            console.debug("[useAIChat] Creating new session via direct server call...");
            const newSession = await createChatSessionDirect({
              data: {
                context: options.context,
                documentId: options.documentId,
                projectId: options.projectId,
              },
            });
            sessionId = newSession.id;
            setActiveSessionId(sessionId);
            console.debug("[useAIChat] Session created:", sessionId);
          }
        }

        // Call the run endpoint directly from main thread (cookies work here)
        // The worker is only used for CAD kernel operations, not HTTP requests
        const response = await fetch(`/api/ai/sessions/${sessionId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Run has started - UI will update via live queries from Durable State
        // StreamDB subscription will automatically show streaming content
      } catch (err) {
        console.error("AI chat error:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeSessionId,
      sessions,
      isAuthenticated,
      sessionsLoaded,
      options.context,
      options.documentId,
      options.projectId,
    ]
  );

  // Derive pending tool approvals from messages
  const pendingToolApprovals: ToolApprovalRequest[] = useMemo(() => {
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

  // Start new chat - just clears UI state, session is created on first message
  const startNewChat = useCallback(() => {
    setActiveSessionId(null);
    setError(null);
    setMessagesData([]);
    setChunksData([]);
    setRunsData([]);
  }, []);

  // Switch to existing session (unarchives if needed)
  const switchToSession = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      // If session is archived, unarchive it first
      if (session.status === "archived") {
        await unarchiveSession(sessionId);
      }

      setActiveSessionId(sessionId);
      setError(null);
      // StreamDB will be created by the effect when activeSessionId changes
    },
    [sessions, unarchiveSession]
  );

  // Archive session and switch away if it was active
  const handleArchiveSession = useCallback(
    async (sessionId: string) => {
      await archiveSession(sessionId);
      // If we just archived the active session, switch to another or start new chat
      if (activeSessionId === sessionId) {
        const remainingActive = sessions.find((s) => s.id !== sessionId && s.status === "active");
        if (remainingActive) {
          await switchToSession(remainingActive.id);
        } else {
          startNewChat();
        }
      }
    },
    [archiveSession, activeSessionId, sessions, switchToSession, startNewChat]
  );

  // Delete session permanently and switch away if it was active
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      // If we just deleted the active session, switch to another or start new chat
      if (activeSessionId === sessionId) {
        const remainingActive = sessions.find((s) => s.id !== sessionId && s.status === "active");
        if (remainingActive) {
          await switchToSession(remainingActive.id);
        } else {
          startNewChat();
        }
      }
    },
    [deleteSession, activeSessionId, sessions, switchToSession, startNewChat]
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
