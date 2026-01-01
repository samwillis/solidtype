# Phase 26: AI Chat UI

## Prerequisites

- Phase 25: AI Diff and Apply

## Goals

- Chat panel UI for AI interaction
- Message history display
- Change preview and approval
- Error handling and feedback
- Prompt templates for common operations

---

## UI Components

### AI Panel Layout

```
┌────────────────────────────────────────┐
│ AI Assistant                       [×] │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 👤 Make the bracket 30mm tall    │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 🤖 I'll modify the extrude       │  │
│  │    distance...                   │  │
│  │                                  │  │
│  │ [Preview Changes]                │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Changes Applied ✓                │  │
│  │ [Undo]                           │  │
│  └──────────────────────────────────┘  │
│                                        │
├────────────────────────────────────────┤
│ ┌────────────────────────────────┐ [→] │
│ │ Type a message...              │     │
│ └────────────────────────────────┘     │
└────────────────────────────────────────┘
```

---

## Implementation

### AIPanel Component

```typescript
// packages/app/src/components/AIPanel.tsx

export function AIPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<AIChange[] | null>(null);

  const { doc } = useDocument();
  const { selection } = useSelection();

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Assemble context
      const context = await assembleAIContext(doc, selection, renderer);

      // Send to AI
      const response = await processUserMessage(userMessage, context);

      // Add assistant message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.message
      }]);

      // If changes proposed, set pending
      if (response.changes) {
        setPendingChanges(response.changes);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'error',
        content: `Error: ${error.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyChanges = async () => {
    if (!pendingChanges) return;

    setLoading(true);

    const result = await applyAIChangesWithRecovery(pendingChanges, doc);

    if (result.ok) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Changes applied successfully.',
        canUndo: true,
      }]);
    } else {
      setMessages(prev => [...prev, {
        role: 'error',
        content: `Failed to apply changes: ${result.message}`,
      }]);
    }

    setPendingChanges(null);
    setLoading(false);
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h3>AI Assistant</h3>
      </div>

      <div className="ai-panel-messages">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {loading && <LoadingIndicator />}

        {pendingChanges && (
          <PendingChangesCard
            changes={pendingChanges}
            onApply={handleApplyChanges}
            onReject={() => setPendingChanges(null)}
          />
        )}
      </div>

      <div className="ai-panel-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button onClick={handleSubmit} disabled={loading || !input.trim()}>
          <Icon name="send" />
        </button>
      </div>
    </div>
  );
}
```

### Chat Message Component

```typescript
function ChatMessage({ message }: { message: ChatMessage }) {
  return (
    <div className={`chat-message ${message.role}`}>
      <div className="message-avatar">
        {message.role === 'user' ? '👤' : message.role === 'assistant' ? '🤖' : 'ℹ️'}
      </div>
      <div className="message-content">
        <Markdown>{message.content}</Markdown>

        {message.canUndo && (
          <button className="undo-button" onClick={handleUndo}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
```

### Pending Changes Preview

```typescript
function PendingChangesCard({ changes, onApply, onReject }) {
  return (
    <div className="pending-changes">
      <h4>Proposed Changes</h4>

      <ul className="changes-list">
        {changes.map((change, i) => (
          <li key={i} className={`change-item ${change.type}`}>
            {formatChange(change)}
          </li>
        ))}
      </ul>

      <div className="changes-actions">
        <button onClick={onReject} className="reject-btn">
          Reject
        </button>
        <button onClick={onApply} className="apply-btn">
          Apply Changes
        </button>
      </div>
    </div>
  );
}

function formatChange(change: AIChange): string {
  switch (change.type) {
    case 'modify':
      return `Modify ${change.featureId}: ${Object.entries(change.attributes)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`;
    case 'add':
      return `Add ${change.feature.type} "${change.feature.name || change.feature.id}"`;
    case 'remove':
      return `Remove ${change.featureId}`;
    default:
      return JSON.stringify(change);
  }
}
```

---

## Prompt Templates

Quick actions for common operations:

```typescript
const PROMPT_TEMPLATES = [
  {
    label: 'Modify Parameter',
    template: 'Change the {{parameter}} of {{feature}} to {{value}}',
    variables: ['parameter', 'feature', 'value'],
  },
  {
    label: 'Add Fillet',
    template: 'Add a {{radius}}mm fillet to the selected edges',
    variables: ['radius'],
  },
  {
    label: 'Add Hole',
    template: 'Add a {{diameter}}mm hole at the center of the selected face',
    variables: ['diameter'],
  },
  {
    label: 'Pattern Feature',
    template: 'Create a linear pattern of {{feature}} with {{count}} copies spaced {{spacing}}mm apart along {{axis}}',
    variables: ['feature', 'count', 'spacing', 'axis'],
  },
];

// Quick action buttons
function QuickActions({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="quick-actions">
      {PROMPT_TEMPLATES.map((template, i) => (
        <button
          key={i}
          onClick={() => onSelect(template.template)}
          className="quick-action-btn"
        >
          {template.label}
        </button>
      ))}
    </div>
  );
}
```

---

## Error Handling

### Display Errors

```typescript
function ErrorMessage({ error }: { error: AIError }) {
  return (
    <div className="error-message">
      <Icon name="error" />
      <div className="error-content">
        <strong>{error.title || 'Error'}</strong>
        <p>{error.message}</p>

        {error.suggestions && (
          <ul className="error-suggestions">
            {error.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

### Retry Logic

```typescript
async function sendWithRetry(
  message: string,
  context: AIContext,
  maxRetries = 2
): Promise<AIResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await processUserMessage(message, context);
    } catch (error) {
      lastError = error;

      // Don't retry on validation errors
      if (error.type === "validation") throw error;

      // Wait before retry
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  throw lastError;
}
```

---

## CSS

```css
/* packages/app/src/components/AIPanel.css */

.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel-bg);
}

.ai-panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.ai-panel-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.chat-message.user {
  flex-direction: row-reverse;
}

.chat-message.user .message-content {
  background: var(--accent-color);
  color: white;
}

.message-content {
  background: var(--message-bg);
  padding: 12px 16px;
  border-radius: 12px;
  max-width: 80%;
}

.pending-changes {
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

.changes-list {
  margin: 12px 0;
  padding-left: 20px;
}

.change-item.add {
  color: var(--success-color);
}
.change-item.remove {
  color: var(--error-color);
}
.change-item.modify {
  color: var(--info-color);
}

.ai-panel-input {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.ai-panel-input textarea {
  flex: 1;
  resize: none;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  min-height: 44px;
  max-height: 120px;
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test message handling
test('handleSubmit adds user message', async () => {
  const { getByPlaceholder, getByText } = render(<AIPanel />);

  const input = getByPlaceholder('Type a message...');
  fireEvent.change(input, { target: { value: 'Make it taller' } });
  fireEvent.submit(input);

  expect(getByText('Make it taller')).toBeInTheDocument();
});

// Test change preview
test('PendingChangesCard displays changes', () => {
  const changes = [
    { type: 'modify', featureId: 'e1', attributes: { distance: '20' } },
  ];

  const { getByText } = render(
    <PendingChangesCard changes={changes} onApply={jest.fn()} onReject={jest.fn()} />
  );

  expect(getByText(/Modify e1/)).toBeInTheDocument();
});
```

### Integration Tests

- Type message → AI responds
- Apply changes → model updates
- Undo → changes reverted
- Error → error message shown

---

## Open Questions

1. **Chat history persistence** - Save chat history?
   - Decision: Store in Yjs document (optional section)

2. **Streaming responses** - Show AI response as it streams?
   - Decision: Yes, for better UX

3. **Context menu integration** - Right-click → "Ask AI about this"?
   - Decision: Yes, good for discoverability
