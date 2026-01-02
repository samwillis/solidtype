import React, { useState, useCallback } from "react";
import "./AIPanel.css";
import { AIIcon } from "./Icons";

interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

const AIPanel: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: "1", title: "New Chat", createdAt: new Date(), messages: [] },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>("1");
  const [showHistory, setShowHistory] = useState(false);
  const [closedSessions, setClosedSessions] = useState<ChatSession[]>([]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const createNewSession = useCallback(() => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      createdAt: new Date(),
      messages: [],
    };
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSession.id);
  }, []);

  const closeSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        setClosedSessions((prev) => [session, ...prev]);
      }
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId);
        if (filtered.length === 0) {
          // Create a new session if we closed the last one
          const newSession: ChatSession = {
            id: Date.now().toString(),
            title: "New Chat",
            createdAt: new Date(),
            messages: [],
          };
          setActiveSessionId(newSession.id);
          return [newSession];
        }
        // Switch to another tab if we closed the active one
        if (sessionId === activeSessionId) {
          setActiveSessionId(filtered[filtered.length - 1].id);
        }
        return filtered;
      });
    },
    [sessions, activeSessionId]
  );

  const restoreSession = useCallback((session: ChatSession) => {
    setSessions((prev) => [...prev, session]);
    setActiveSessionId(session.id);
    setClosedSessions((prev) => prev.filter((s) => s.id !== session.id));
    setShowHistory(false);
  }, []);

  return (
    <div className="ai-panel">
      {/* Tab bar */}
      <div className="ai-panel-tabs">
        <div className="ai-panel-tabs-list">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`ai-panel-tab ${session.id === activeSessionId ? "active" : ""}`}
              onClick={() => setActiveSessionId(session.id)}
            >
              <span className="ai-panel-tab-title">{session.title}</span>
              <button
                className="ai-panel-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(session.id);
                }}
                aria-label="Close tab"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
          <button className="ai-panel-new-tab" onClick={createNewSession} aria-label="New chat">
            <PlusIcon />
          </button>
        </div>
        <div className="ai-panel-tabs-actions">
          <button
            className="ai-panel-history-btn"
            onClick={() => setShowHistory(!showHistory)}
            aria-label="Session history"
          >
            <HistoryIcon />
          </button>
          {showHistory && (
            <div className="ai-panel-history-dropdown">
              <div className="ai-panel-history-header">Previous Sessions</div>
              {closedSessions.length > 0 ? (
                closedSessions.map((session) => (
                  <button
                    key={session.id}
                    className="ai-panel-history-item"
                    onClick={() => restoreSession(session)}
                  >
                    <span>{session.title}</span>
                    <span className="ai-panel-history-date">
                      {session.createdAt.toLocaleDateString()}
                    </span>
                  </button>
                ))
              ) : (
                <div className="ai-panel-history-empty">No previous sessions</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat content */}
      <div className="ai-panel-content">
        {activeSession && activeSession.messages.length === 0 ? (
          <div className="ai-panel-empty">
            <AIIcon />
            <div className="ai-panel-empty-title">AI Assistant</div>
            <div className="ai-panel-empty-hint">
              Start a conversation to get help with your design
            </div>
          </div>
        ) : (
          <div className="ai-panel-messages">
            {activeSession?.messages.map((msg, idx) => (
              <div key={idx} className={`ai-panel-message ai-panel-message-${msg.role}`}>
                {msg.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="ai-panel-input-area">
        <div className="ai-panel-input-wrapper">
          <textarea className="ai-panel-input" placeholder="Ask the AI assistant..." rows={2} />
          <button className="ai-panel-send" aria-label="Send message">
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

// Icons
const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const HistoryIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

const AgentIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="8.5" cy="16" r="1.5" fill="currentColor" />
    <circle cx="15.5" cy="16" r="1.5" fill="currentColor" />
    <path d="M12 3v4" />
    <path d="M8 5l4-2 4 2" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default AIPanel;
