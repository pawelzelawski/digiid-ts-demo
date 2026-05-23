import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/client/**/*.{ts,tsx}', 'src/server/**/*.ts'],
      exclude: ['src/client/main.tsx'],
      thresholds: {
        lines: 70,
        statements: 70,
        branches: 55,
        functions: 70,
      },
    },
  },
});
