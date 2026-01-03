/**
 * AI Chat System Unit Tests
 *
 * Tests for the Durable State-based AI chat system including:
 * - Schema validation
 * - Transcript hydration
 * - Approval level classification
 */

import { describe, it, expect } from "vitest";

// Import the schema and types
import {
  messageSchema,
  chunkSchema,
  runSchema,
  type Message,
  type Chunk,
  type Run,
} from "../lib/ai/state/schema";
import { hydrateFromArrays, toModelMessages } from "../lib/ai/state/hydrate";
import { getApprovalLevel } from "../lib/ai/approval";

describe("AI Chat State Schema", () => {
  describe("Message Schema", () => {
    it("should validate a valid user message", () => {
      const message: Message = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        runId: "550e8400-e29b-41d4-a716-446655440001",
        role: "user",
        status: "complete",
        content: "Hello, world!",
        createdAt: new Date().toISOString(),
      };

      const result = messageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate an assistant message", () => {
      const message: Message = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        runId: "550e8400-e29b-41d4-a716-446655440001",
        role: "assistant",
        status: "streaming",
        createdAt: new Date().toISOString(),
      };

      const result = messageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate a tool_call message", () => {
      const message: Message = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        runId: "550e8400-e29b-41d4-a716-446655440001",
        role: "tool_call",
        status: "pending",
        toolName: "create_project",
        toolArgs: { name: "Test Project" },
        toolCallId: "call_123",
        requiresApproval: true,
        createdAt: new Date().toISOString(),
      };

      const result = messageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate a tool_result message", () => {
      const message: Message = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        runId: "550e8400-e29b-41d4-a716-446655440001",
        role: "tool_result",
        status: "complete",
        toolCallId: "call_123",
        toolResult: { projectId: "proj_456" },
        content: '{"projectId":"proj_456"}',
        createdAt: new Date().toISOString(),
      };

      const result = messageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should reject invalid role", () => {
      const message = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        runId: "550e8400-e29b-41d4-a716-446655440001",
        role: "invalid_role",
        status: "complete",
        createdAt: new Date().toISOString(),
      };

      const result = messageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });

    it("should reject invalid status", () => {
      const message = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        runId: "550e8400-e29b-41d4-a716-446655440001",
        role: "user",
        status: "invalid_status",
        createdAt: new Date().toISOString(),
      };

      const result = messageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  describe("Chunk Schema", () => {
    it("should validate a valid chunk", () => {
      const chunk: Chunk = {
        id: "msg123:0",
        messageId: "550e8400-e29b-41d4-a716-446655440000",
        seq: 0,
        delta: "Hello",
        createdAt: new Date().toISOString(),
      };

      const result = chunkSchema.safeParse(chunk);
      expect(result.success).toBe(true);
    });

    it("should validate sequential chunks", () => {
      const chunks: Chunk[] = [
        {
          id: "msg123:0",
          messageId: "550e8400-e29b-41d4-a716-446655440000",
          seq: 0,
          delta: "Hello",
          createdAt: new Date().toISOString(),
        },
        {
          id: "msg123:1",
          messageId: "550e8400-e29b-41d4-a716-446655440000",
          seq: 1,
          delta: ", world",
          createdAt: new Date().toISOString(),
        },
        {
          id: "msg123:2",
          messageId: "550e8400-e29b-41d4-a716-446655440000",
          seq: 2,
          delta: "!",
          createdAt: new Date().toISOString(),
        },
      ];

      for (const chunk of chunks) {
        const result = chunkSchema.safeParse(chunk);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Run Schema", () => {
    it("should validate a running run", () => {
      const run: Run = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "running",
        userMessageId: "550e8400-e29b-41d4-a716-446655440001",
        assistantMessageId: "550e8400-e29b-41d4-a716-446655440002",
        startedAt: new Date().toISOString(),
      };

      const result = runSchema.safeParse(run);
      expect(result.success).toBe(true);
    });

    it("should validate a completed run", () => {
      const run: Run = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "complete",
        userMessageId: "550e8400-e29b-41d4-a716-446655440001",
        assistantMessageId: "550e8400-e29b-41d4-a716-446655440002",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const result = runSchema.safeParse(run);
      expect(result.success).toBe(true);
    });

    it("should validate an errored run", () => {
      const run: Run = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "error",
        userMessageId: "550e8400-e29b-41d4-a716-446655440001",
        assistantMessageId: "550e8400-e29b-41d4-a716-446655440002",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        error: "LLM API error: rate limited",
      };

      const result = runSchema.safeParse(run);
      expect(result.success).toBe(true);
    });
  });
});

describe("Transcript Hydration", () => {
  it("should hydrate user messages correctly", () => {
    const messages: Message[] = [
      {
        id: "msg1",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "What is 2+2?",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];

    const transcript = hydrateFromArrays(messages, []);

    expect(transcript).toHaveLength(1);
    expect(transcript[0].content).toBe("What is 2+2?");
    expect(transcript[0].role).toBe("user");
  });

  it("should hydrate assistant messages from chunks", () => {
    const messages: Message[] = [
      {
        id: "msg1",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "What is 2+2?",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "msg2",
        runId: "run1",
        role: "assistant",
        status: "complete",
        createdAt: "2024-01-01T00:00:01Z",
      },
    ];

    const chunks: Chunk[] = [
      { id: "msg2:0", messageId: "msg2", seq: 0, delta: "The ", createdAt: "2024-01-01T00:00:01Z" },
      {
        id: "msg2:1",
        messageId: "msg2",
        seq: 1,
        delta: "answer ",
        createdAt: "2024-01-01T00:00:01Z",
      },
      {
        id: "msg2:2",
        messageId: "msg2",
        seq: 2,
        delta: "is 4.",
        createdAt: "2024-01-01T00:00:01Z",
      },
    ];

    const transcript = hydrateFromArrays(messages, chunks);

    expect(transcript).toHaveLength(2);
    expect(transcript[0].content).toBe("What is 2+2?");
    expect(transcript[1].content).toBe("The answer is 4.");
  });

  it("should handle out-of-order chunks by sorting by seq", () => {
    const messages: Message[] = [
      {
        id: "msg1",
        runId: "run1",
        role: "assistant",
        status: "complete",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];

    // Chunks arrive out of order
    const chunks: Chunk[] = [
      { id: "msg1:2", messageId: "msg1", seq: 2, delta: "C", createdAt: "2024-01-01T00:00:03Z" },
      { id: "msg1:0", messageId: "msg1", seq: 0, delta: "A", createdAt: "2024-01-01T00:00:01Z" },
      { id: "msg1:1", messageId: "msg1", seq: 1, delta: "B", createdAt: "2024-01-01T00:00:02Z" },
    ];

    const transcript = hydrateFromArrays(messages, chunks);

    expect(transcript).toHaveLength(1);
    expect(transcript[0].content).toBe("ABC");
  });

  it("should sort messages by createdAt", () => {
    const messages: Message[] = [
      // Note: For non-assistant messages, content is taken from the message directly
      {
        id: "msg2",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "Second",
        createdAt: "2024-01-01T00:00:02Z",
      },
      {
        id: "msg1",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "First",
        createdAt: "2024-01-01T00:00:01Z",
      },
    ];

    const transcript = hydrateFromArrays(messages, []);

    expect(transcript[0].content).toBe("First");
    expect(transcript[1].content).toBe("Second");
  });

  it("should filter out error messages", () => {
    const messages: Message[] = [
      {
        id: "msg1",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "Hello",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "msg2",
        runId: "run1",
        role: "error",
        status: "complete",
        content: "Something went wrong",
        createdAt: "2024-01-01T00:00:01Z",
      },
    ];

    const transcript = hydrateFromArrays(messages, []);

    expect(transcript).toHaveLength(1);
    expect(transcript[0].role).toBe("user");
  });

  it("should handle tool calls and results", () => {
    const messages: Message[] = [
      {
        id: "msg1",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "Create a project",
        createdAt: "2024-01-01T00:00:01Z",
      },
      {
        id: "msg2",
        runId: "run1",
        role: "assistant",
        status: "complete",
        createdAt: "2024-01-01T00:00:02Z",
      },
      {
        id: "msg3",
        runId: "run1",
        role: "tool_call",
        status: "complete",
        toolName: "create_project",
        toolArgs: { name: "My Project" },
        toolCallId: "call_123",
        parentMessageId: "msg2",
        createdAt: "2024-01-01T00:00:03Z",
      },
      {
        id: "msg4",
        runId: "run1",
        role: "tool_result",
        status: "complete",
        toolCallId: "call_123",
        toolResult: { id: "proj_456" },
        content: '{"id":"proj_456"}',
        parentMessageId: "msg2",
        createdAt: "2024-01-01T00:00:04Z",
      },
    ];

    const transcript = hydrateFromArrays(messages, []);

    expect(transcript).toHaveLength(4);
    expect(transcript[2].role).toBe("tool_call");
    expect(transcript[2].toolName).toBe("create_project");
    expect(transcript[3].role).toBe("tool_result");
    expect(transcript[3].toolResult).toEqual({ id: "proj_456" });
  });
});

describe("toModelMessages", () => {
  it("should convert user and assistant messages", () => {
    const transcript = [
      {
        id: "msg1",
        runId: "run1",
        role: "user" as const,
        status: "complete" as const,
        content: "Hello",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "msg2",
        runId: "run1",
        role: "assistant" as const,
        status: "complete" as const,
        content: "Hi there!",
        createdAt: "2024-01-01T00:00:01Z",
      },
    ];

    const modelMessages = toModelMessages(transcript);

    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0]).toEqual({ role: "user", content: "Hello" });
    expect(modelMessages[1]).toEqual({ role: "assistant", content: "Hi there!" });
  });

  it("should filter out error and tool_call messages", () => {
    const transcript = [
      {
        id: "msg1",
        runId: "run1",
        role: "user" as const,
        status: "complete" as const,
        content: "Hello",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "msg2",
        runId: "run1",
        role: "error" as const,
        status: "complete" as const,
        content: "Something went wrong",
        createdAt: "2024-01-01T00:00:01Z",
      },
      {
        id: "msg3",
        runId: "run1",
        role: "tool_call" as const,
        status: "complete" as const,
        content: "",
        toolName: "test_tool",
        toolCallId: "call_123",
        createdAt: "2024-01-01T00:00:02Z",
      },
    ];

    const modelMessages = toModelMessages(transcript);

    expect(modelMessages).toHaveLength(1);
    expect(modelMessages[0].role).toBe("user");
  });

  it("should exclude tool_result from history (tool calls handled by TanStack AI)", () => {
    // Tool results are not included in the message history sent to the model.
    // TanStack AI handles tool calls internally during the current run.
    // For multi-turn conversations, we only need user prompts and final assistant responses.
    const transcript = [
      {
        id: "msg1",
        runId: "run1",
        role: "tool_result" as const,
        status: "complete" as const,
        content: '{"result":"success"}',
        toolCallId: "call_123",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];

    const modelMessages = toModelMessages(transcript);

    // Tool results are filtered out
    expect(modelMessages).toHaveLength(0);
  });

  it("should skip empty assistant messages (tool-call-only)", () => {
    const transcript = [
      {
        id: "msg1",
        runId: "run1",
        role: "user" as const,
        status: "complete" as const,
        content: "Create a project",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "msg2",
        runId: "run1",
        role: "assistant" as const,
        status: "complete" as const,
        content: "", // Empty - assistant only made tool calls
        createdAt: "2024-01-01T00:00:01Z",
      },
      {
        id: "msg3",
        runId: "run1",
        role: "assistant" as const,
        status: "complete" as const,
        content: "I created the project for you!",
        createdAt: "2024-01-01T00:00:02Z",
      },
    ];

    const modelMessages = toModelMessages(transcript);

    // Empty assistant message is filtered out
    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0].role).toBe("user");
    expect(modelMessages[1].role).toBe("assistant");
    expect(modelMessages[1].content).toBe("I created the project for you!");
  });
});

describe("Tool Approval Level", () => {
  // Note: The approval system is permissive - only destructive operations require confirmation.
  // Non-destructive operations (including creates, renames) are auto-approved.

  it("should classify non-destructive tools as auto", () => {
    // Read operations
    expect(getApprovalLevel("list_projects", "dashboard")).toBe("auto");
    expect(getApprovalLevel("list_documents", "dashboard")).toBe("auto");
    expect(getApprovalLevel("get_project", "dashboard")).toBe("auto");

    // Create/rename operations (non-destructive, undoable)
    expect(getApprovalLevel("create_project", "dashboard")).toBe("auto");
    expect(getApprovalLevel("rename_project", "dashboard")).toBe("auto");
  });

  it("should classify destructive (delete) tools as confirm", () => {
    // Note: Tool names use camelCase in the registry
    expect(getApprovalLevel("deleteDocument", "dashboard")).toBe("confirm");
    expect(getApprovalLevel("deleteProject", "dashboard")).toBe("confirm");
    expect(getApprovalLevel("deleteFolder", "dashboard")).toBe("confirm");
  });

  it("should classify unknown dashboard tools as auto (permissive default)", () => {
    // Unknown tools default to auto in the current design
    expect(getApprovalLevel("unknown_tool", "dashboard")).toBe("auto");
  });

  it("should classify all editor tools as auto (undoable via Yjs)", () => {
    expect(getApprovalLevel("sketch_line", "editor")).toBe("auto");
    expect(getApprovalLevel("extrude", "editor")).toBe("auto");
    expect(getApprovalLevel("unknown_cad_tool", "editor")).toBe("auto");
  });
});

describe("Pending Approvals Filter", () => {
  it("should filter messages to only pending tool calls requiring approval", () => {
    const messages: Message[] = [
      {
        id: "msg1",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "Hi",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "msg2",
        runId: "run1",
        role: "tool_call",
        status: "pending",
        toolName: "create_project",
        toolCallId: "call_1",
        requiresApproval: true,
        createdAt: "2024-01-01T00:00:01Z",
      },
      {
        id: "msg3",
        runId: "run1",
        role: "tool_call",
        status: "running",
        toolName: "list_projects",
        toolCallId: "call_2",
        requiresApproval: false,
        createdAt: "2024-01-01T00:00:02Z",
      },
      {
        id: "msg4",
        runId: "run1",
        role: "tool_call",
        status: "pending",
        toolName: "delete_project",
        toolCallId: "call_3",
        requiresApproval: true,
        createdAt: "2024-01-01T00:00:03Z",
      },
    ];

    // Filter pending approvals manually (same logic as getPendingApprovals but without db)
    const pending = messages.filter(
      (m) => m.role === "tool_call" && m.status === "pending" && m.requiresApproval === true
    );

    expect(pending).toHaveLength(2);
    expect(pending[0].toolName).toBe("create_project");
    expect(pending[1].toolName).toBe("delete_project");
  });

  it("should return empty array when no pending approvals", () => {
    const messages: Message[] = [
      {
        id: "msg1",
        runId: "run1",
        role: "user",
        status: "complete",
        content: "Hi",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];

    const pending = messages.filter(
      (m) => m.role === "tool_call" && m.status === "pending" && m.requiresApproval === true
    );

    expect(pending).toHaveLength(0);
  });
});
