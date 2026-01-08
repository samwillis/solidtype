/**
 * Command Layer Types
 *
 * Shared types for the unified command layer used by both UI and AI.
 * Commands are the canonical way to mutate the Yjs document.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 1
 */

/**
 * Result type for all commands.
 * Commands return either success with a value or failure with an error message.
 */
export type CommandResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Helper to create a successful command result
 */
export function ok<T>(value: T): CommandResult<T> {
  return { ok: true, value };
}

/**
 * Helper to create a failed command result
 */
export function err<T>(error: string): CommandResult<T> {
  return { ok: false, error };
}
