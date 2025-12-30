import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      // Disable SPA mode to enable server functions
      // spa: { enabled: true },
    }),
    // React's vite plugin must come after start's vite plugin
    react(),
  ],
  worker: {
    format: 'es',
  },
  resolve: {
    // Ensure Vite can resolve opencascade.js paths from node_modules
    dedupe: ['opencascade.js'],
  },
  optimizeDeps: {
    exclude: ['typescript', 'opencascade.js'],
  },
  ssr: {
    noExternal: ['@solidtype/core'],
  },
  build: {
    rollupOptions: {
      external: [
        'opencascade.js',
        'opencascade.js/dist/opencascade.wasm.js',
        /opencascade\.wasm\.wasm/,
      ],
    },
  },
  assetsInclude: ['**/*.wasm'],
});
