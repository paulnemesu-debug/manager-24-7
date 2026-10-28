import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Pe Windows, scanarea antivirus și inițializarea workerelor pot încetini
    // primul test care încarcă definițiile HACCP. Păstrăm paralelism moderat
    // și un prag realist, fără a dezactiva sau ocoli vreun test.
    maxWorkers: 2,
    testTimeout: 20_000,
  },
});
