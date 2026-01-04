/**
 * Server Functions - Shared Helpers
 *
 * Common utilities used across server function modules.
 */

import { pool } from "../db";

/**
 * Normalize a nullable UUID field value.
 * Converts empty strings, undefined, and whitespace-only strings to undefined.
 * Using undefined (not null) causes Drizzle to omit the field from the insert,
 * which allows the database to use its default (NULL) for nullable columns.
 */
export function normalizeNullableUuid(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return undefined;
}

/**
 * Get the current transaction ID from the database.
 * Used for optimistic locking and sync operations.
 */
export async function getCurrentTxid(): Promise<number> {
  const result = await pool.query("SELECT txid_current()");
  return Number(result.rows[0]?.txid_current || 0);
}
