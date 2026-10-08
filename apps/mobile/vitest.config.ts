import { defineConfig } from 'vitest/config';

// Logic only: native modules are replaced in src/test/setup.ts, screens are not rendered.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
