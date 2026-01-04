/**
 * Server Functions - Shared Helpers
 *
 * Pure utility functions that can be used on both client and server.
 * NOTE: Do NOT import server-only modules (db, pg, etc.) here!
 */

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
