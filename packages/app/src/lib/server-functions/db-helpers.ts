/**
 * Server Functions - Database Helpers
 *
 * Shared database utilities for server functions.
 * NOTE: These are server-only and import from db.
 */

import { pool } from "../db";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Get the current PostgreSQL transaction ID.
 * Electric uses this for reconciliation after mutations.
 *
 * IMPORTANT: This should be called within the same transaction as the mutation
 * to get the correct txid. If called outside a transaction, it will start a new
 * transaction just to get the ID.
 *
 * @param tx - Optional Drizzle transaction. If provided, uses the transaction connection.
 *             If not provided, uses the pool directly.
 */
export async function getCurrentTxid(tx?: PgTransaction<any, any, any>): Promise<number> {
  if (tx) {
    // Use the transaction's connection to get the txid within the same transaction
    const result = await tx.execute(sql`SELECT txid_current()`);
    return Number((result as any)[0]?.txid_current || 0);
  } else {
    // Fallback for non-transactional operations
    const result = await pool.query("SELECT txid_current()");
    return Number(result.rows[0]?.txid_current || 0);
  }
}

/**
 * Wrapper type for mutation results with txid.
 */
export interface MutationResult<T> {
  data: T;
  txid: number;
}
