/**
 * Tool Approval Panel Component
 *
 * Displays pending tool approval requests and allows user to approve/reject.
 */

import { addAlwaysAllow } from "../../lib/ai/approval-preferences";
import "./ToolApprovalPanel.css";

interface ToolApprovalRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

interface ToolApprovalPanelProps {
  requests: ToolApprovalRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export function ToolApprovalPanel({ requests, onApprove, onReject }: ToolApprovalPanelProps) {
  if (requests.length === 0) return null;

  const handleAlwaysAllow = (request: ToolApprovalRequest) => {
    // Add to always-allow list and approve this request
    addAlwaysAllow(request.name);
    onApprove(request.id);
  };

  return (
    <div className="tool-approval-panel">
      <div className="tool-approval-header">
        <AlertIcon />
        <span>AI wants to perform actions</span>
      </div>

      {requests.map((request) => (
        <div key={request.id} className="tool-approval-item">
          <div className="tool-approval-name">{formatToolName(request.name)}</div>
          <div className="tool-approval-params">
            <pre>{JSON.stringify(request.arguments, null, 2)}</pre>
          </div>
          <div className="tool-approval-actions">
            <button
              onClick={() => onReject(request.id)}
              className="tool-approval-reject"
              aria-label="Reject"
            >
              <XIcon />
              Reject
            </button>
            <button
              onClick={() => handleAlwaysAllow(request)}
              className="tool-approval-always"
              aria-label="Always Allow"
              title="Approve and always allow this tool in the future"
            >
              <ShieldIcon />
              Always
            </button>
            <button
              onClick={() => onApprove(request.id)}
              className="tool-approval-approve"
              aria-label="Approve"
            >
              <CheckIcon />
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// Icons
const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
