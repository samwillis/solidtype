/**
 * better-auth client configuration
 *
 * Used in React components for authentication.
 */

import { createAuthClient } from "better-auth/react";

// Create auth client
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
});

// Export commonly used hooks and functions
export const { useSession, signIn, signUp, getSession } = authClient;

// Wrap signOut to refresh page after logout to clear collections and state
export const signOut = async () => {
  await authClient.signOut();
  // Refresh page to clear Electric collections and all application state
  window.location.href = "/";
};

// Type exports
export type AuthSession = ReturnType<typeof useSession>["data"];
