/**
 * Authentication Hook
 *
 * Provides the current authenticated user from better-auth context.
 * Returns null if not authenticated.
 */

import { useSession } from "../lib/auth-client";

/**
 * Hook to get current authenticated user.
 * Returns null if not authenticated.
 */
export function useAuth() {
  const { data: session, isPending } = useSession();

  return {
    user: session?.user ?? null,
    userId: session?.user?.id ?? null,
    isAuthenticated: !!session?.user,
    isLoading: isPending,
  };
}
