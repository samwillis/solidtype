/**
 * Database connection and Drizzle ORM setup
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
// Import better-auth schema to include in Drizzle instance
import { user, session, account, verification } from "../db/schema/better-auth";

// Get DATABASE_URL or use default for local dev
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://solidtype:solidtype@localhost:54321/solidtype";

// Create connection pool
const pool = new Pool({
  connectionString: databaseUrl,
});

// Create Drizzle instance with schema (including better-auth tables)
// This allows foreign keys in our application schemas to reference better-auth's user table
export const db = drizzle(pool, {
  schema: {
    ...schema,
    // Include better-auth tables so foreign keys can reference them
    user,
    session,
    account,
    verification,
  },
});

// Export pool for direct access if needed
export { pool };
