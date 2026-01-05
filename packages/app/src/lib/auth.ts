/**
 * better-auth server configuration
 *
 * Handles user authentication, sessions, and OAuth providers.
 *
 * Uses Drizzle adapter for integration with our existing database setup.
 * Better-auth will manage its own tables (user, session, account, etc.)
 * alongside our application tables.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "./db";
import { workspaces, workspaceMembers, projects, branches, projectMembers } from "../db/schema";
import { user, session, account, verification } from "../db/schema/better-auth";

/**
 * Creates a personal workspace for a new user
 */
async function createPersonalWorkspace(userId: string, userName?: string | null) {
  try {
    // Generate a slug from the user's name or use a default
    const workspaceName = userName ? `${userName}'s Workspace` : "My Workspace";

    // Generate a base slug
    let baseSlug = userName
      ? userName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      : "";

    // Ensure slug is not empty and add suffix
    if (!baseSlug) {
      baseSlug = `workspace-${userId.slice(0, 8)}`;
    } else {
      baseSlug = `${baseSlug}-workspace`;
    }

    // Handle potential slug conflicts by appending user ID if needed
    let workspaceSlug = baseSlug;
    let attempts = 0;
    const maxAttempts = 5;

    // Create workspace and membership in a transaction
    const [workspace] = await db.transaction(async (tx) => {
      // Try to create with the slug, retry with suffix if conflict
      let ws;
      while (attempts < maxAttempts) {
        try {
          [ws] = await tx
            .insert(workspaces)
            .values({
              name: workspaceName,
              slug: workspaceSlug,
              description: "Personal workspace",
              createdBy: userId,
            })
            .returning();
          break; // Success
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- checking Postgres error properties
        } catch (error: any) {
          // If unique constraint violation, try with a suffix
          if (error?.code === "23505" && error?.constraint?.includes("slug")) {
            attempts++;
            workspaceSlug = `${baseSlug}-${userId.slice(0, 8)}`;
            if (attempts < maxAttempts) {
              continue;
            }
          }
          throw error;
        }
      }

      if (!ws) {
        throw new Error("Failed to create workspace after multiple attempts");
      }

      // Add user as owner
      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: userId,
        role: "owner",
      });

      return [ws];
    });

    return workspace;
  } catch (error) {
    // Log error but don't fail user creation
    console.error("Failed to create personal workspace:", error);
    throw error; // Re-throw to let better-auth handle it
  }
}

/**
 * Creates a "My first project" for a new user in their personal workspace
 */
async function createFirstProject(workspaceId: string, userId: string) {
  try {
    // Create project, project member, and main branch in a transaction
    const [project] = await db.transaction(async (tx) => {
      // Create project
      const [createdProject] = await tx
        .insert(projects)
        .values({
          workspaceId: workspaceId,
          name: "My first project",
          description: "Welcome to SolidType! This is your first project.",
          createdBy: userId,
        })
        .returning();

      // Add creator as project owner (required for Electric sync access)
      await tx.insert(projectMembers).values({
        projectId: createdProject.id,
        userId: userId,
        role: "owner",
        canEdit: true,
      });

      // Automatically create "main" branch
      await tx.insert(branches).values({
        projectId: createdProject.id,
        name: "main",
        description: "Main branch",
        isMain: true,
        createdBy: userId,
        ownerId: userId,
      });

      return [createdProject];
    });

    return project;
  } catch (error) {
    // Log error but don't fail user creation
    console.error("Failed to create first project:", error);
    // Don't throw - this is optional and shouldn't block user signup
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Include better-auth schema so the adapter can use it
    // This allows our application schemas to reference better-auth's user table
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Create a personal workspace for the new user
          const workspace = await createPersonalWorkspace(user.id, user.name);

          // Create "My first project" in the personal workspace
          if (workspace) {
            await createFirstProject(workspace.id, user.id);
          }
        },
      },
    },
  },
  socialProviders: {
    // GitHub OAuth (optional)
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    // Google OAuth (optional)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },
  trustedOrigins: ["http://localhost:3000", "http://localhost:3001"],
  plugins: [
    tanstackStartCookies(), // Must be the last plugin
  ],
});

// Type for session
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
