import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@solidtype/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
