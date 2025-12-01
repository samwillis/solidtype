import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@solidtype/core', '@solidtype/oo'],
  },
});
