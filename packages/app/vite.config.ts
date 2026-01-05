import { defineConfig, Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

/**
 * Plugin to handle TanStack Start virtual modules that aren't resolved in some edge cases.
 * This is a workaround for when the TanStack Start plugin doesn't correctly provide
 * the tanstack-start-injected-head-scripts virtual module.
 */
function tanstackVirtualModuleFix(): Plugin {
  const virtualModuleId = "tanstack-start-injected-head-scripts:";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  return {
    name: "tanstack-virtual-module-fix",
    // Run after tanstack plugin but before others
    enforce: "post",
    resolveId(id) {
      // Only handle this specific virtual module pattern
      if (id.startsWith(virtualModuleId)) {
        return resolvedVirtualModuleId + id.slice(virtualModuleId.length);
      }
      return null;
    },
    load(id) {
      // Provide an empty module for this virtual import
      if (id.startsWith(resolvedVirtualModuleId)) {
        return "export const injectedHeadScripts = '';";
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
    tanstackVirtualModuleFix(),
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
