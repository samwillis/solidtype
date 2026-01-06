/**
 * Tests for Worker Chat Controller
 *
 * Tests the controller that manages TanStack AI chat state in the worker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("../../../../../src/lib/ai/state/db", () => ({
  createChatStreamDB: vi.fn(),
}));

vi.mock("../../../../../src/lib/yjs-sync", () => ({
  createDocumentSync: vi.fn(),
}));

vi.mock("../../../../../src/editor/document/createDocument", () => ({
  loadDocument: vi.fn(),
}));

vi.mock("../../../../../src/lib/ai/runtime/durable-stream-adapter", () => ({
  streamChunksFromDurableStream: vi.fn(),
  resumeStreamFromDurableStream: vi.fn(),
  getActiveRun: vi.fn(),
}));

vi.mock("../../../../../src/lib/ai/runtime/sketch-tool-executor", () => ({
  executeSketchTool: vi.fn(),
  isSketchTool: vi.fn().mockReturnValue(true),
}));

vi.mock("yjs", () => {
  const mockDoc = { destroy: vi.fn() };
  return {
    Doc: vi.fn().mockImplementation(() => mockDoc),
    default: { Doc: vi.fn().mockImplementation(() => mockDoc) },
  };
});

import { createChatStreamDB } from "../../../../../src/lib/ai/state/db";
import { createDocumentSync } from "../../../../../src/lib/yjs-sync";
import { loadDocument } from "../../../../../src/editor/document/createDocument";
import { WorkerChatController } from "../../../../../src/lib/ai/runtime/worker-chat-controller";
import type { AIChatWorkerEvent } from "../../../../../src/lib/ai/runtime/types";

describe("WorkerChatController", () => {
  let mockBroadcast: ReturnType<typeof vi.fn>;
  let mockStreamDb: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBroadcast = vi.fn();

    // Mock StreamDB
    mockStreamDb = {
      preload: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      stream: {
        append: vi.fn().mockResolvedValue(undefined),
      },
      collections: {
        runs: {
          values: () => new Map().values(),
          get: () => undefined,
        },
        messages: {
          values: () => new Map().values(),
          get: () => undefined,
        },
        chunks: {
          values: () => new Map().values(),
          get: () => undefined,
        },
      },
    };

    (createChatStreamDB as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialize", () => {
    it("should initialize without document", async () => {
      const controller = new WorkerChatController({
        sessionId: "session1",
        broadcast: mockBroadcast,
      });

      await controller.initialize();

      expect(controller.getState()).toBe("ready");
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "session-ready",
        sessionId: "session1",
      });
    });

    it("should initialize with document sync", async () => {
      const mockSync = {
        onSynced: vi.fn((cb) => {
          // Simulate immediate sync
          setTimeout(() => cb(true), 10);
          return vi.fn();
        }),
        onError: vi.fn(() => vi.fn()),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };

      (createDocumentSync as ReturnType<typeof vi.fn>).mockReturnValue(mockSync);
      (loadDocument as ReturnType<typeof vi.fn>).mockReturnValue({});

      const controller = new WorkerChatController({
        sessionId: "session1",
        documentId: "doc1",
        broadcast: mockBroadcast,
      });

      await controller.initialize();

      expect(mockSync.connect).toHaveBeenCalled();
      expect(controller.getState()).toBe("ready");
    });

    it("should resume active run on init", async () => {
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

      mockStreamDb.collections.runs = {
        values: () => mockRuns.values(),
        get: (id: string) => mockRuns.get(id),
      };

      // Mock the stream adapter to yield done immediately
      const { streamChunksFromDurableStream } =
        await import("../../../../../src/lib/ai/runtime/durable-stream-adapter");
      (streamChunksFromDurableStream as ReturnType<typeof vi.fn>).mockImplementation(
        async function* () {
          yield { type: "done", finishReason: "stop" };
        }
      );

      const controller = new WorkerChatController({
        sessionId: "session1",
        broadcast: mockBroadcast,
      });

      await controller.initialize();

      // Should have attempted to resume the run
      expect(streamChunksFromDurableStream).toHaveBeenCalledWith(
        "session1",
        "run1",
        expect.anything()
      );
    });
  });

  describe("sendMessage", () => {
    it("should reject when not ready", async () => {
      const controller = new WorkerChatController({
        sessionId: "session1",
        broadcast: mockBroadcast,
      });

      // Controller is in "initializing" state
      await expect(controller.sendMessage("hello")).rejects.toThrow(
        "Cannot send message in state: initializing"
      );
    });

    it("should reject when already streaming", async () => {
      const controller = new WorkerChatController({
        sessionId: "session1",
        broadcast: mockBroadcast,
      });

      await controller.initialize();

      // Mock fetch to hang
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          })
      );

      // Mock stream adapter to also hang (sendMessage uses Promise.all)
      const { streamChunksFromDurableStream } =
        await import("../../../../../src/lib/ai/runtime/durable-stream-adapter");
      (streamChunksFromDurableStream as ReturnType<typeof vi.fn>).mockImplementation(
        async function* () {
          // Hang forever
          await new Promise(() => {});
        }
      );

      // Start a message (will hang because both fetch and stream hang)
      const _firstMessage = controller.sendMessage("first");

      // Give a tick for sendMessage to start
      await new Promise((r) => setTimeout(r, 10));

      // Second message should be rejected
      await expect(controller.sendMessage("second")).rejects.toThrow(
        "A message is already being processed"
      );

      // Clean up
      controller.stop();
    });
  });

  describe("dispose", () => {
    it("should clean up stream resources", async () => {
      // Test dispose without document sync to keep it simple
      const controller = new WorkerChatController({
        sessionId: "session1",
        broadcast: mockBroadcast,
      });

      await controller.initialize();

      controller.dispose();

      expect(mockStreamDb.close).toHaveBeenCalled();
    });
  });

  describe("setActiveSketchId", () => {
    it("should update active sketch", async () => {
      const controller = new WorkerChatController({
        sessionId: "session1",
        broadcast: mockBroadcast,
      });

      await controller.initialize();

      // Should not throw
      controller.setActiveSketchId("sketch1");
      controller.setActiveSketchId(null);
    });
  });
});
