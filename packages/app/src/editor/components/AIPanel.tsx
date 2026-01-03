/**
 * AI Panel Component
 *
 * Main chat interface for AI assistant.
 * Works in both dashboard and editor contexts.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuTrash2 } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import { useAIChat } from "../../hooks/useAIChat";
import { ToolApprovalPanel } from "../../components/ai/ToolApprovalPanel";
import AISettingsMenu from "../../components/ai/AISettingsMenu";
import "./AIPanel.css";
import { AIIcon } from "./Icons";

interface AIPanelProps {
  context?: "dashboard" | "editor";
  documentId?: string;
  projectId?: string;
}

const AIPanel: React.FC<AIPanelProps> = ({ context = "editor", documentId, projectId }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [historyPosition, setHistoryPosition] = useState({ top: 0, right: 0 });
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);

  // Connect to backend via useAIChat hook
  const {
    messages,
    isLoading,
    isReady,
    sessions,
    activeSessionId,
    toolApprovalRequests,
    approveToolCall,
    rejectToolCall,
    sendMessage,
    startNewChat,
    switchToSession,
    archiveSession,
    deleteSession,
  } = useAIChat({
    context,
    documentId,
    projectId,
  });

  const activeSessions = sessions.filter((s) => s.status === "active");
  const archivedSessions = sessions.filter((s) => s.status === "archived");

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Calculate position for history dropdown
  const updateHistoryPosition = useCallback(() => {
    if (historyBtnRef.current) {
      const rect = historyBtnRef.current.getBoundingClientRect();
      setHistoryPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  // Handle outside click for history dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(target) &&
        historyBtnRef.current &&
        !historyBtnRef.current.contains(target)
      ) {
        setShowHistory(false);
      }
    }
    if (showHistory) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [showHistory]);

  // Update position on scroll/resize
  useEffect(() => {
    if (showHistory) {
      updateHistoryPosition();
      window.addEventListener("scroll", updateHistoryPosition, true);
      window.addEventListener("resize", updateHistoryPosition);
      return () => {
        window.removeEventListener("scroll", updateHistoryPosition, true);
        window.removeEventListener("resize", updateHistoryPosition);
      };
    }
    return undefined;
  }, [showHistory, updateHistoryPosition]);

  const toggleHistory = useCallback(() => {
    if (!showHistory) {
      updateHistoryPosition();
    }
    setShowHistory(!showHistory);
  }, [showHistory, updateHistoryPosition]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !isReady) return;
    const message = inputValue.trim();
    setInputValue("");
    try {
      await sendMessage(message);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }, [inputValue, isLoading, isReady, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleCloseSession = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      archiveSession(sessionId);
    },
    [archiveSession]
  );

  return (
    <div className="ai-panel">
      {/* Tab bar */}
      <div className="ai-panel-tabs">
        <div className="ai-panel-tabs-list">
          {/* Show "New Chat" tab when in new chat mode (no active session) */}
          {activeSessionId === null && (
            <div className="ai-panel-tab active">
              <span className="ai-panel-tab-title">New Chat</span>
            </div>
          )}
          {/* Show saved active sessions */}
          {activeSessions.map((session) => (
            <div
              key={session.id}
              className={`ai-panel-tab ${session.id === activeSessionId ? "active" : ""}`}
              onClick={() => switchToSession(session.id)}
            >
              <span className="ai-panel-tab-title">{session.title || "Untitled"}</span>
              <button
                className="ai-panel-tab-close"
                onClick={(e) => handleCloseSession(e, session.id)}
                aria-label="Archive chat"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
          {/* Only show + button if we're viewing a saved session */}
          {activeSessionId !== null && (
            <button className="ai-panel-new-tab" onClick={startNewChat} aria-label="New chat">
              <PlusIcon />
            </button>
          )}
        </div>
        <div className="ai-panel-tabs-actions">
          <button
            ref={historyBtnRef}
            className="ai-panel-history-btn"
            onClick={toggleHistory}
            aria-label="Session history"
            aria-expanded={showHistory}
          >
            <HistoryIcon />
          </button>
          {showHistory &&
            createPortal(
              <div
                ref={historyDropdownRef}
                className="ai-panel-history-dropdown"
                style={{
                  position: "fixed",
                  top: historyPosition.top,
                  right: historyPosition.right,
                  zIndex: 10000,
                }}
              >
                <div className="ai-panel-history-header">Chat History</div>
                {activeSessions.length > 0 && (
                  <>
                    {activeSessions.map((session) => (
                      <div key={session.id} className="ai-panel-history-item">
                        <button
                          className="ai-panel-history-item-content"
                          onClick={() => {
                            switchToSession(session.id);
                            setShowHistory(false);
                          }}
                        >
                          <span className="ai-panel-history-title">
                            {session.title || "Untitled"}
                          </span>
                          <span className="ai-panel-history-date">
                            {new Date(session.createdAt).toLocaleDateString()}
                          </span>
                        </button>
                        <button
                          className="ai-panel-history-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          aria-label="Delete session"
                        >
                          <LuTrash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {archivedSessions.length > 0 && (
                      <div className="ai-panel-history-divider" />
                    )}
                  </>
                )}
                {archivedSessions.length > 0 ? (
                  archivedSessions.map((session) => (
                    <div key={session.id} className="ai-panel-history-item">
                      <button
                        className="ai-panel-history-item-content"
                        onClick={() => {
                          switchToSession(session.id);
                          setShowHistory(false);
                        }}
                      >
                        <span className="ai-panel-history-title">
                          {session.title || "Untitled"}
                        </span>
                        <span className="ai-panel-history-date">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </span>
                      </button>
                      <button
                        className="ai-panel-history-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        aria-label="Delete session"
                      >
                        <LuTrash2 size={12} />
                      </button>
                    </div>
                  ))
                ) : activeSessions.length === 0 ? (
                  <div className="ai-panel-history-empty">No sessions</div>
                ) : null}
              </div>,
              document.body
            )}
        </div>
      </div>

      {/* Chat content */}
      <div className="ai-panel-content">
        {messages.length === 0 ? (
          <div className="ai-panel-empty">
            <AIIcon />
            <div className="ai-panel-empty-title">AI Assistant</div>
            <div className="ai-panel-empty-hint">
              {context === "dashboard"
                ? "Ask about projects, documents, workspaces..."
                : "Describe what you want to create or modify..."}
            </div>
          </div>
        ) : (
          <div className="ai-panel-messages">
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`ai-panel-message ai-panel-message-${msg.role}`}>
                {msg.role === "assistant" ? (
                  <div className="ai-panel-markdown">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            {isLoading && (
              <div className="ai-panel-message ai-panel-message-assistant ai-panel-message-loading">
                <span className="ai-panel-loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Tool approval requests */}
        {toolApprovalRequests.length > 0 && (
          <ToolApprovalPanel
            requests={toolApprovalRequests}
            onApprove={approveToolCall}
            onReject={rejectToolCall}
          />
        )}
      </div>

      {/* Input area - Cursor-style */}
      <div className="ai-panel-input-area">
        <div className="ai-panel-input-card">
          <textarea
            className="ai-panel-input"
            placeholder={
              !isReady
                ? "Loading..."
                : context === "dashboard"
                  ? "Ask about projects, documents, or workspaces..."
                  : "Describe what you want to create or modify..."
            }
            aria-label="Chat message input"
            rows={2}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isReady}
          />
          <div className="ai-panel-input-footer">
            <div className="ai-panel-input-left">
              <AISettingsMenu />
            </div>
            <div className="ai-panel-input-right">
              <button
                className="ai-panel-send"
                aria-label="Send message"
                onClick={handleSend}
                disabled={!isReady || isLoading || !inputValue.trim()}
              >
                <SendIcon />
              </button>
            </div>
          </div>
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

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default AIPanel;
