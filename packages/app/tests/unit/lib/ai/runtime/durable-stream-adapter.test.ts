/**
 * Tests for Durable Stream Adapter
 *
 * Tests the custom TanStack AI stream adapter that converts
 * Durable Stream records to StreamChunks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the db module before importing the adapter
vi.mock("../../../../../src/lib/ai/state/db", () => ({
  createChatStreamDB: vi.fn(),
}));

import { createChatStreamDB } from "../../../../../src/lib/ai/state/db";
import type { StreamChunk } from "../../../../../src/lib/ai/runtime/durable-stream-adapter";

describe("Durable Stream Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("streamChunksFromDurableStream", () => {
    it("should yield content chunks from stream", async () => {
      // Mock StreamDB
      const mockChunks = new Map([
        [
          "msg1:0",
          {
            id: "msg1:0",
            messageId: "msg1",
            seq: 0,
            delta: "Hello ",
            createdAt: new Date().toISOString(),
          },
        ],
        [
          "msg1:1",
          {
            id: "msg1:1",
            messageId: "msg1",
            seq: 1,
            delta: "world!",
            createdAt: new Date().toISOString(),
          },
        ],
      ]);

      const mockRuns = new Map([
        [
          "run1",
          {
            id: "run1",
            status: "complete",
            assistantMessageId: "msg1",
            userMessageId: "user1",
            startedAt: new Date().toISOString(),
          },
        ],
      ]);

      const mockDb = {
        preload: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        collections: {
          chunks: { values: () => mockChunks.values(), get: (id: string) => mockChunks.get(id) },
          messages: { values: () => new Map().values(), get: () => undefined },
          runs: { values: () => mockRuns.values(), get: (id: string) => mockRuns.get(id) },
        },
      };

      (createChatStreamDB as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      // Import the function after mocking
      const { streamChunksFromDurableStream } =
        await import("../../../../../src/lib/ai/runtime/durable-stream-adapter");

      const chunks: StreamChunk[] = [];
      for await (const chunk of streamChunksFromDurableStream("session1", "run1")) {
        chunks.push(chunk);
        if (chunk.type === "done") break;
      }

      // Should have content chunks and a done chunk
      expect(chunks.some((c) => c.type === "content")).toBe(true);
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });

    it("should yield tool_call chunks", async () => {
      const mockToolCall = {
        id: "tc1",
        runId: "run1",
        role: "tool_call",
        status: "running",
        toolName: "addLine",
        toolArgs: { x1: 0, y1: 0, x2: 10, y2: 10 },
        toolCallId: "call1",
        createdAt: new Date().toISOString(),
      };

      const mockMessages = new Map([["tc1", mockToolCall]]);

      const mockRuns = new Map([
        [
          "run1",
          {
            id: "run1",
            status: "complete",
            assistantMessageId: "msg1",
            userMessageId: "user1",
            startedAt: new Date().toISOString(),
          },
        ],
      ]);

      const mockDb = {
        preload: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        collections: {
          chunks: { values: () => new Map().values(), get: () => undefined },
          messages: {
            values: () => mockMessages.values(),
            get: (id: string) => mockMessages.get(id),
          },
          runs: { values: () => mockRuns.values(), get: (id: string) => mockRuns.get(id) },
        },
      };

      (createChatStreamDB as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      const { streamChunksFromDurableStream } =
        await import("../../../../../src/lib/ai/runtime/durable-stream-adapter");

      const chunks: StreamChunk[] = [];
      for await (const chunk of streamChunksFromDurableStream("session1", "run1")) {
        chunks.push(chunk);
        if (chunk.type === "done") break;
      }

      const toolCallChunk = chunks.find((c) => c.type === "tool_call");
      expect(toolCallChunk).toBeDefined();
      if (toolCallChunk && toolCallChunk.type === "tool_call") {
        expect(toolCallChunk.toolCall.function.name).toBe("addLine");
      }
    });

    it("should handle abort signal", async () => {
      const mockRuns = new Map([
        [
          "run1",
          {
            id: "run1",
            status: "running",
            assistantMessageId: "msg1",
            userMessageId: "user1",
            startedAt: new Date().toISOString(),
          },
        ],
      ]);

      const mockDb = {
        preload: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        collections: {
          chunks: { values: () => new Map().values(), get: () => undefined },
          messages: { values: () => new Map().values(), get: () => undefined },
          runs: { values: () => mockRuns.values(), get: (id: string) => mockRuns.get(id) },
        },
      };

      (createChatStreamDB as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      const { streamChunksFromDurableStream } =
        await import("../../../../../src/lib/ai/runtime/durable-stream-adapter");

      const abortController = new AbortController();

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 50);

      const chunks: StreamChunk[] = [];
      for await (const chunk of streamChunksFromDurableStream(
        "session1",
        "run1",
        abortController.signal,
        10
      )) {
        chunks.push(chunk);
      }

      // Should exit without done chunk when aborted
      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  describe("getActiveRun", () => {
    it("should return active run if exists", async () => {
      const mockRuns = new Map([
        [
          "run1",
          {
            id: "run1",
            status: "running",
            assistantMessageId: "msg1",
            userMessageId: "user1",
            startedAt: new Date().toISOString(),
          },
        ],
      ]);

      const mockDb = {
        preload: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        collections: {
          runs: { values: () => mockRuns.values(), get: (id: string) => mockRuns.get(id) },
          chunks: { values: () => new Map().values() },
          messages: { values: () => new Map().values() },
        },
      };

      (createChatStreamDB as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      const { getActiveRun } =
        await import("../../../../../src/lib/ai/runtime/durable-stream-adapter");

      const result = await getActiveRun("session1");
      expect(result).toBeDefined();
      expect(result?.id).toBe("run1");
      expect(result?.status).toBe("running");
    });

    it("should return null if no active run", async () => {
      const mockRuns = new Map([
        [
          "run1",
          {
            id: "run1",
            status: "complete",
            assistantMessageId: "msg1",
            userMessageId: "user1",
            startedAt: new Date().toISOString(),
          },
        ],
      ]);

      const mockDb = {
        preload: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        collections: {
          runs: { values: () => mockRuns.values(), get: (id: string) => mockRuns.get(id) },
          chunks: { values: () => new Map().values() },
          messages: { values: () => new Map().values() },
        },
      };

      (createChatStreamDB as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      const { getActiveRun } =
        await import("../../../../../src/lib/ai/runtime/durable-stream-adapter");

      const result = await getActiveRun("session1");
      expect(result).toBeNull();
    });
  });
});
