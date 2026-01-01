/**
 * API Routes Index
 *
 * Server functions are defined in src/lib/server-functions.ts
 * and can be imported directly from there.
 *
 * Usage:
 * ```typescript
 * import { getWorkspaces, createProject } from '~/lib/server-functions';
 * import { useServerFn } from '@tanstack/react-start';
 *
 * // In a component:
 * const serverFn = useServerFn(getWorkspaces);
 * const result = await serverFn({ data: { userId: '...' } });
 * ```
 *
 * NOTE: Currently in SPA mode - server functions only work when
 * TanStack Start is configured with SSR enabled.
 */

export * from "../../lib/server-functions";
