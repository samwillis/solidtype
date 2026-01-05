/**
 * Schemas Index
 *
 * Centralized Zod schemas for all entities.
 * These schemas are the source of truth for data validation and type inference.
 *
 * Architecture:
 * - Entity schemas define the full database structure with snake_case field names
 * - Input types accept strings for dates (from API/Electric sync)
 * - Output types have Date objects (after transformation)
 * - Validators (in validators/) derive from these base schemas
 * - Electric collections use these schemas with timestamptz parsing
 */

// Common helpers
export * from "./common";

// Entity schemas
export * from "./entities";
