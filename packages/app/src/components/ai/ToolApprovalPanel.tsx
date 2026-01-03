/**
 * Tool Approval Panel Component
 *
 * Displays pending tool approval requests inline in the chat.
 * Groups multiple requests into a single approval prompt.
 */

import { addAlwaysAllow } from "../../lib/ai/approval-preferences";
import "./ToolApprovalPanel.css";

interface ToolApprovalRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  messageId: string; // The actual message ID to use for approval
}

interface ToolApprovalPanelProps {
  requests: ToolApprovalRequest[];
  onApprove: (messageId: string) => void;
  onReject: (messageId: string) => void;
}

export function ToolApprovalPanel({ requests, onApprove, onReject }: ToolApprovalPanelProps) {
  if (requests.length === 0) return null;

  // Group requests by action name
  const grouped = requests.reduce(
    (acc, req) => {
      const name = req.name;
      if (!acc[name]) acc[name] = [];
      acc[name].push(req);
      return acc;
    },
    {} as Record<string, ToolApprovalRequest[]>
  );

  const actionNames = Object.keys(grouped);
  const totalCount = requests.length;

  const handleApproveAll = () => {
    // Use messageId for the approval call
    requests.forEach((req) => onApprove(req.messageId));
  };

  const handleRejectAll = () => {
    // Use messageId for the rejection call
    requests.forEach((req) => onReject(req.messageId));
  };

  const handleAlwaysAllowAll = () => {
    // Add all unique action names to always-allow
    actionNames.forEach((name) => addAlwaysAllow(name));
    handleApproveAll();
  };

  // Build summary text
  let summaryText: string;
  if (actionNames.length === 1) {
    const name = formatToolName(actionNames[0]);
    summaryText = totalCount === 1 ? `${name}?` : `${name} (${totalCount}×)?`;
  } else {
    summaryText = `${totalCount} actions?`;
  }

  return (
    <div className="tool-approval-panel">
      <div className="tool-approval-item">
        <span className="tool-approval-text">
          Run <strong>{summaryText}</strong>
        </span>
        <div className="tool-approval-actions">
          <button
            onClick={handleRejectAll}
            className="tool-approval-btn tool-approval-reject"
            title="Reject all"
          >
            ✕
          </button>
          <button
            onClick={handleAlwaysAllowAll}
            className="tool-approval-btn tool-approval-always"
            title="Always allow these actions"
          >
            Always
          </button>
          <button
            onClick={handleApproveAll}
            className="tool-approval-btn tool-approval-approve"
            title="Approve all"
          >
            ✓ Yes
          </button>
        </div>
      </div>
    </div>
  );
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
