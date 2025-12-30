import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
  ],
  test: {
    globals: true,
    environment: 'node',
    // Exclude tests that use the old TopoModel API (pre-OCCT)
    // - src/api/api.test.ts: Uses old TopoModel-based SolidSession
    // Note: src/api/SolidSession.test.ts now works with OCCT thanks to
    // the Node.js wasmBinary loading approach in init.ts
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/api/api.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/kernel/**',  // OCCT wrappers
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
