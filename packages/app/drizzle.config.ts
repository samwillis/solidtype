/**
 * Drizzle Kit configuration
 * 
 * Used for migrations and schema introspection.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://solidtype:solidtype@localhost:54321/solidtype',
  },
});
