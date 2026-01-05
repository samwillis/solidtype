/**
 * API Routes Index
 *
 * This file re-exports server functions from src/lib/server-functions.ts.
 * The `-` prefix in the filename tells TanStack Router to ignore this file
 * (it's not a route, just a utility re-export).
 *
 * Server functions are defined in src/lib/server-functions.ts and can be
 * imported directly from there. This file is optional and mainly serves
 * as a convenience re-export.
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
 */

export * from "../../lib/server-functions";
