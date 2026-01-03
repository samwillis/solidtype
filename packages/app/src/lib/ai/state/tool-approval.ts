/**
 * Tool Approval Utilities for Durable State
 *
 * Functions for managing tool call approvals through Durable State.
 */

import type { ChatStreamDB } from "./db";
import { chatStateSchema, type Message } from "./schema";
import { v4 as uuid } from "uuid";

/**
 * Create a pending tool call message that requires approval
 */
export async function createPendingToolCall(
  db: ChatStreamDB,
  options: {
    runId: string;
    parentMessageId: string;
    toolName: string;
    toolArgs: unknown;
    toolCallId: string;
    requiresApproval: boolean;
  }
): Promise<string> {
  const messageId = uuid();

  await db.stream.append(
    chatStateSchema.messages.insert({
      value: {
        id: messageId,
        runId: options.runId,
        role: "tool_call",
        status: options.requiresApproval ? "pending" : "running",
        parentMessageId: options.parentMessageId,
        toolName: options.toolName,
        toolArgs: options.toolArgs,
        toolCallId: options.toolCallId,
        requiresApproval: options.requiresApproval,
        createdAt: new Date().toISOString(),
      },
    })
  );

  return messageId;
}

/**
 * Approve a pending tool call
 */
export async function approveToolCall(db: ChatStreamDB, messageId: string): Promise<void> {
  const message = db.collections.messages.get(messageId);
  if (!message) {
    throw new Error(`Tool call message not found: ${messageId}`);
  }

  if (message.role !== "tool_call" || message.status !== "pending") {
    throw new Error(`Message is not a pending tool call: ${messageId}`);
  }

  await db.stream.append(
    chatStateSchema.messages.update({
      value: {
        ...message,
        status: "running",
        updatedAt: new Date().toISOString(),
      },
      oldValue: message,
    })
  );
}

/**
 * Reject a pending tool call
 */
export async function rejectToolCall(db: ChatStreamDB, messageId: string): Promise<void> {
  const message = db.collections.messages.get(messageId);
  if (!message) {
    throw new Error(`Tool call message not found: ${messageId}`);
  }

  if (message.role !== "tool_call" || message.status !== "pending") {
    throw new Error(`Message is not a pending tool call: ${messageId}`);
  }

  await db.stream.append(
    chatStateSchema.messages.update({
      value: {
        ...message,
        status: "error",
        updatedAt: new Date().toISOString(),
      },
      oldValue: message,
    })
  );

  // Create a tool result message indicating rejection
  await db.stream.append(
    chatStateSchema.messages.insert({
      value: {
        id: uuid(),
        runId: message.runId,
        role: "tool_result",
        status: "complete",
        parentMessageId: message.parentMessageId,
        toolCallId: message.toolCallId,
        toolResult: { error: "Tool call rejected by user" },
        createdAt: new Date().toISOString(),
      },
    })
  );
}

/**
 * Mark a tool call as completed with result
 */
export async function completeToolCall(
  db: ChatStreamDB,
  messageId: string,
  result: unknown
): Promise<void> {
  const message = db.collections.messages.get(messageId);
  if (!message) {
    throw new Error(`Tool call message not found: ${messageId}`);
  }

  // Update tool call status
  await db.stream.append(
    chatStateSchema.messages.update({
      value: {
        ...message,
        status: "complete",
        updatedAt: new Date().toISOString(),
      },
      oldValue: message,
    })
  );

  // Create tool result message
  await db.stream.append(
    chatStateSchema.messages.insert({
      value: {
        id: uuid(),
        runId: message.runId,
        role: "tool_result",
        status: "complete",
        parentMessageId: message.parentMessageId,
        toolCallId: message.toolCallId,
        toolResult: result,
        createdAt: new Date().toISOString(),
      },
    })
  );
}

/**
 * Mark a tool call as failed with error
 */
export async function failToolCall(
  db: ChatStreamDB,
  messageId: string,
  error: string
): Promise<void> {
  const message = db.collections.messages.get(messageId);
  if (!message) {
    throw new Error(`Tool call message not found: ${messageId}`);
  }

  // Update tool call status
  await db.stream.append(
    chatStateSchema.messages.update({
      value: {
        ...message,
        status: "error",
        updatedAt: new Date().toISOString(),
      },
      oldValue: message,
    })
  );

  // Create error result message
  await db.stream.append(
    chatStateSchema.messages.insert({
      value: {
        id: uuid(),
        runId: message.runId,
        role: "tool_result",
        status: "complete",
        parentMessageId: message.parentMessageId,
        toolCallId: message.toolCallId,
        toolResult: { error },
        createdAt: new Date().toISOString(),
      },
    })
  );
}

/**
 * Get all pending tool calls that require approval
 */
export function getPendingApprovals(db: ChatStreamDB): Message[] {
  return Array.from(db.collections.messages.values()).filter(
    (m) => m.role === "tool_call" && m.status === "pending" && m.requiresApproval === true
  );
}
