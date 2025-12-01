import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@solidtype/core': '../core/src',
      '@solidtype/oo': '../oo/src',
    },
  },
});
