/**
 * AI Chat Hook
 *
 * Simple hook for managing AI chat UI state.
 * Makes direct fetch calls to /api/ai/chat (no TanStack AI React hooks).
 * The actual AI logic runs server-side.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useAuth } from "./useAuth";
import { loadChatHistory, persistChunk } from "../lib/ai/persistence";
import { updateChatSession } from "../lib/ai/session-functions";
import { aiChatSessionsCollection, type AIChatSession } from "../lib/electric-collections";
import { getAIChatWorkerClient } from "../lib/ai/runtime/ai-chat-worker-client";

interface UseAIChatOptions {
  context: "dashboard" | "editor";
  documentId?: string;
  projectId?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
}

interface ToolApprovalRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  resolve: (approved: boolean) => void;
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
  const sessions: AIChatSession[] = sortedSessions.map((row) => ({
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
 * Main chat hook - simple fetch-based implementation
 *
 * Session creation is LAZY - no session is created until the user sends their first message.
 * This prevents creating empty sessions just by opening the chat UI.
 */
export function useAIChat(options: UseAIChatOptions) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [toolApprovalRequests, setToolApprovalRequests] = useState<ToolApprovalRequest[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    sessions,
    isLoading: sessionsLoading,
    isSuccess: sessionsLoaded,
    createSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
    refetch: refetchSessions,
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

  // Load history from Durable Stream when session changes
  useEffect(() => {
    if (activeSessionId) {
      loadChatHistory(activeSessionId).then((history) => {
        if (history.length > 0) {
          setMessages(history);
        }
      });
    }
  }, [activeSessionId]);

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

      // Ensure we have a session before sending
      const session = activeSessionId ? { id: activeSessionId } : await ensureSession();

      // Add user message to UI
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Generate assistant message ID early so we can reference it in catch block
      const assistantMessageId = crypto.randomUUID();
      let assistantMessageAdded = false;

      try {
        // Send to API
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context: options.context,
            documentId: options.documentId,
            projectId: options.projectId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.statusText}`);
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantContent = "";

        // Add assistant message placeholder
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            content: "",
          },
        ]);
        assistantMessageAdded = true;

        // Buffer for incomplete SSE lines
        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          sseBuffer += chunk;

          // Parse complete SSE events (split by double newline)
          const events = sseBuffer.split("\n\n");
          // Keep incomplete event in buffer
          sseBuffer = events.pop() || "";

          for (const event of events) {
            const lines = event.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  // TanStack AI StreamChunk format:
                  // type: 'content' | 'tool_call' | 'tool_result' | 'done' | 'error' | ...
                  // For 'content' type:
                  //   delta: string (incremental token)
                  //   content: string (full accumulated content)
                  if (parsed.type === "content") {
                    // Use delta for incremental updates (preferred)
                    if (parsed.delta) {
                      assistantContent += parsed.delta;
                      // Persist each chunk to Durable Streams
                      persistChunk(session.id, {
                        type: "assistant-chunk",
                        messageId: assistantMessageId,
                        content: parsed.delta,
                        timestamp: new Date().toISOString(),
                      }).catch((error) => {
                        console.debug("Failed to persist assistant chunk:", error);
                        // Non-fatal - continue even if persistence fails
                      });
                    } else if (parsed.content !== undefined) {
                      // Fallback to full content if no delta
                      assistantContent = parsed.content;
                    }
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId ? { ...m, content: assistantContent } : m
                      )
                    );
                  } else if (parsed.type === "done") {
                    // Message complete - persist completion marker
                    persistChunk(session.id, {
                      type: "assistant-complete",
                      messageId: assistantMessageId,
                      timestamp: new Date().toISOString(),
                    }).catch((error) => {
                      console.debug("Failed to persist assistant complete:", error);
                    });
                  }
                } catch {
                  // Ignore parse errors for non-JSON lines
                }
              }
            }
          }
        }

        // Update message count in PostgreSQL
        await updateChatSession({
          data: {
            sessionId: session.id,
            messageCount: messages.length + 2,
          },
        });

        // Auto-generate title from first message
        if (messages.length === 0) {
          const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
          await updateChatSession({
            data: { sessionId: session.id, title },
          });
          refetchSessions();
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was cancelled, ignore
          return;
        }
        console.error("AI chat error:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
        // Remove the empty assistant placeholder on error (keep user message)
        if (assistantMessageAdded) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      messages,
      options,
      activeSessionId,
      ensureSession,
      refetchSessions,
      isAuthenticated,
      sessionsLoaded,
    ]
  );

  // Tool approval handlers
  const approveToolCall = useCallback((requestId: string) => {
    setToolApprovalRequests((prev) => {
      const request = prev.find((r) => r.id === requestId);
      if (request) {
        request.resolve(true);
      }
      return prev.filter((r) => r.id !== requestId);
    });
  }, []);

  const rejectToolCall = useCallback((requestId: string) => {
    setToolApprovalRequests((prev) => {
      const request = prev.find((r) => r.id === requestId);
      if (request) {
        request.resolve(false);
      }
      return prev.filter((r) => r.id !== requestId);
    });
  }, []);

  // Start new chat - just clears UI state, session is created on first message
  const startNewChat = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
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
      const history = await loadChatHistory(sessionId);
      setMessages(history);
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
    isLoading,
    error,
    // Auth state
    isAuthenticated,
    isReady,
    // Session management
    sessions,
    sessionsLoading: sessionsLoading || authLoading,
    activeSessionId,
    // Tool approval
    toolApprovalRequests,
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
