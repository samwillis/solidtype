/**
 * Users table schema
 *
 * Note: better-auth manages the user table, sessions, and accounts.
 * We just define the table here for type inference and relations.
 */

import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // better-auth uses text IDs, not UUIDs
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Type for user record
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
