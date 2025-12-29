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
      // Enable SPA mode - no server-side rendering
      spa: {
        enabled: true,
      },
    }),
    // React's vite plugin must come after start's vite plugin
    react(),
  ],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['typescript'],
  },
});
