import { defineConfig, Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

// Node.js-only modules that should not be bundled for the browser
// These are used by server functions but should be externalized in client bundles
const serverOnlyModules = [
  // PostgreSQL client and dependencies
  "pg",
  "postgres-bytea",
  "pg-types",
  "pg-pool",
  "pg-protocol",
  "pg-connection-string",
  "pgpass",
  // Drizzle ORM postgres adapter (uses pg internally)
  "drizzle-orm/node-postgres",
  // better-auth (server-only authentication library)
  "better-auth",
];

// Client-safe subpaths of otherwise server-only modules
const clientSafeSubpaths = [
  "better-auth/react", // React client for better-auth (browser-safe)
  "better-auth/client", // Client utilities for better-auth (browser-safe)
];

/**
 * Check if a module ID matches a server-only module
 * Handles both exact matches (e.g., "pg") and prefix matches (e.g., "pg/lib/...")
 */
function isServerOnlyModule(id: string): boolean {
  // First check if it's a client-safe subpath (don't stub these)
  for (const safe of clientSafeSubpaths) {
    if (id === safe || id.startsWith(safe + "/")) {
      return false;
    }
  }

  // Then check if it matches a server-only module
  for (const mod of serverOnlyModules) {
    // Exact match
    if (id === mod) return true;
    // Prefix match (e.g., "pg/lib/client" matches "pg")
    if (id.startsWith(mod + "/")) return true;
  }
  return false;
}

/**
 * Plugin to stub out Node.js-only modules for browser builds
 * These modules are only used in server functions which run on the server
 */
function stubServerModules(): Plugin {
  const virtualPrefix = "\0virtual:server-stub:";

  return {
    name: "stub-server-modules",
    // Using enforce: "post" so TanStack Start's virtual modules are resolved first
    enforce: "post",
    resolveId(id, _importer, options) {
      // Skip for SSR - let Node.js resolve these normally
      if (options?.ssr) {
        return null;
      }

      // Skip virtual modules (used by Vite and TanStack Start)
      if (
        id.startsWith("\0") ||
        id.startsWith("virtual:") ||
        id.startsWith("tanstack-start-")
      ) {
        return null;
      }

      // Skip relative and absolute paths
      if (id.startsWith(".") || id.startsWith("/")) {
        return null;
      }

      // Check if this is a server-only module
      if (isServerOnlyModule(id)) {
        return { id: `${virtualPrefix}${id}`, moduleSideEffects: false };
      }
      return null;
    },
    load(id, options) {
      // Skip for SSR - server should use real modules
      if (options?.ssr) {
        return null;
      }

      if (id.startsWith(virtualPrefix)) {
        // Return stub implementations that won't crash when used
        // These are never actually called at runtime because server functions
        // are executed on the server via RPC, but they need to be parseable
        return `
          // Stub Pool class that won't crash when instantiated
          export class Pool {
            constructor() {}
            connect() { return Promise.resolve({ release: () => {} }); }
            query() { return Promise.resolve({ rows: [] }); }
            end() { return Promise.resolve(); }
          }
          export class Client {
            constructor() {}
            connect() { return Promise.resolve(); }
            query() { return Promise.resolve({ rows: [] }); }
            end() { return Promise.resolve(); }
          }
          export const drizzle = () => ({
            query: {},
            select: () => ({ from: () => Promise.resolve([]) }),
            insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
            update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
            delete: () => ({ where: () => Promise.resolve() }),
            transaction: (fn) => fn({}),
          });
          export const drizzleAdapter = () => ({});
          // better-auth stubs
          export const betterAuth = () => ({
            api: {
              getSession: () => Promise.resolve(null),
            },
          });
          export const tanstackStartCookies = () => ({});
          export default { Pool, Client, betterAuth };
        `;
      }
      return null;
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    stubServerModules(),
    tsConfigPaths(),
    tanstackStart({
      // Disable SPA mode to enable server functions
      // spa: { enabled: true },
    }),
    // React's vite plugin must come after start's vite plugin
    react(),
  ],
  worker: {
    format: "es",
  },
  resolve: {
    // Ensure Vite can resolve opencascade.js paths from node_modules
    dedupe: ["opencascade.js"],
  },
  optimizeDeps: {
    exclude: ["typescript", "opencascade.js"],
  },
  ssr: {
    noExternal: ["@solidtype/core"],
  },
  build: {
    rollupOptions: {
      external: [
        "opencascade.js",
        "opencascade.js/dist/opencascade.wasm.js",
        /opencascade\.wasm\.wasm/,
      ],
    },
  },
  assetsInclude: ["**/*.wasm"],
});
