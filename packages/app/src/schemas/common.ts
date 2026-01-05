/**
 * Common Schema Helpers
 *
 * Shared Zod schema components used across entity schemas.
 * These helpers ensure consistent type handling, especially for dates.
 */

import { z } from "zod";

// ============================================================================
// Date Field Helpers
// ============================================================================

/**
 * Date field that accepts string or Date, always outputs Date.
 * Used for required timestamp fields (created_at, updated_at, etc.)
 *
 * Input: string | Date
 * Output: Date
 */
export const dateField = z
  .union([z.string(), z.date()])
  .transform((v) => (typeof v === "string" ? new Date(v) : v));

/**
 * Nullable date field that accepts string, Date, or null.
 * Used for optional timestamp fields (deleted_at, merged_at, etc.)
 *
 * Input: string | Date | null
 * Output: Date | null
 */
export const nullableDateField = z
  .union([z.string(), z.date(), z.null()])
  .transform((v) => (v && typeof v === "string" ? new Date(v) : v));

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Helper type to extract input type from a schema
 */
export type SchemaInput<T extends z.ZodTypeAny> = z.input<T>;

/**
 * Helper type to extract output type from a schema
 */
export type SchemaOutput<T extends z.ZodTypeAny> = z.output<T>;
