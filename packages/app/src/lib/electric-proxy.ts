/**
 * Electric SQL Proxy
 * 
 * Proxies Electric shape requests through our server for security.
 * This ensures:
 * 1. SOURCE_SECRET is never exposed to the browser
 * 2. Shapes are defined server-side (no client-defined WHERE clauses)
 * 3. Authorization is enforced before streaming
 * 
 * See: https://electric-sql.com/AGENTS.md
 */

import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from '@electric-sql/client';

// Electric URL - use Cloud or self-hosted
const ELECTRIC_URL = process.env.ELECTRIC_URL || 'http://localhost:3100/v1/shape';

/**
 * Create an Electric shape proxy handler
 * 
 * @param table - The table to sync
 * @param whereBuilder - Optional function to build WHERE clause with user context
 */
export function createElectricProxy(
  table: string,
  whereBuilder?: (userId: string) => { where: string; params?: string[] } | null
) {
  return async (request: Request, userId: string) => {
    const requestUrl = new URL(request.url);
    const origin = new URL(ELECTRIC_URL);

    // Pass Electric protocol params (offset, handle, live, etc.)
    requestUrl.searchParams.forEach((value, key) => {
      if (ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
        origin.searchParams.set(key, value);
      }
    });

    // Server decides the shape - never trust client
    origin.searchParams.set('table', table);

    // Build WHERE clause with authorization
    if (whereBuilder) {
      const whereResult = whereBuilder(userId);
      if (whereResult === null) {
        // Access denied
        return new Response('Forbidden', { status: 403 });
      }
      origin.searchParams.set('where', whereResult.where);
      if (whereResult.params) {
        // Electric expects params as individual query parameters: params[1]=value, params[2]=value, etc.
        // See: https://electric-sql.com/docs/guides/auth
        whereResult.params.forEach((value, index) => {
          origin.searchParams.set(`params[${index + 1}]`, String(value));
        });
      }
    }

    // Add Electric Cloud credentials if available
    if (process.env.ELECTRIC_SOURCE_ID) {
      origin.searchParams.set('source_id', process.env.ELECTRIC_SOURCE_ID);
    }
    if (process.env.ELECTRIC_SOURCE_SECRET) {
      origin.searchParams.set('secret', process.env.ELECTRIC_SOURCE_SECRET);
    }

    // Proxy to Electric
    const response = await fetch(origin.toString(), {
      headers: {
        'Accept': request.headers.get('Accept') || 'application/json',
      },
    });

    // Strip encoding headers that might cause issues
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    
    // Add Vary header for cookie-based auth to prevent cache issues
    // See: https://electric-sql.com/docs/guides/auth#session-invalidation-with-vary-headers
    headers.set('Vary', 'Cookie');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

// ============================================================================
// Pre-configured proxies for SolidType entities
// ============================================================================

/**
 * Proxy for user workspaces
 * Shape: workspaces where user is a member
 */
export const workspacesProxy = createElectricProxy(
  'workspaces',
  (userId) => {
    return {
      where: `id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)`,
      params: [userId],
    };
  }
);

/**
 * Proxy for branches
 * Shape: branches where user has access via project membership
 */
export const branchesProxy = createElectricProxy(
  'branches',
  (userId) => {
    return {
      where: `project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
      params: [userId],
    };
  }
);

/**
 * Proxy for documents
 * Shape: documents where user has access via project membership
 */
export const documentsProxy = createElectricProxy(
  'documents',
  (userId) => {
    return {
      where: `is_deleted = false AND branch_id IN (
        SELECT id FROM branches 
        WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
      )`,
      params: [userId],
    };
  }
);

/**
 * Proxy for folders
 * Shape: folders where user has access via project membership
 */
export const foldersProxy = createElectricProxy(
  'folders',
  (userId) => {
    return {
      where: `branch_id IN (
        SELECT id FROM branches 
        WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
      )`,
      params: [userId],
    };
  }
);
