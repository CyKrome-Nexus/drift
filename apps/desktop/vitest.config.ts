import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts: the tests need no React plugin or Tauri dev server.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
