import { defineConfig } from 'vitest/config';

// Unit tests only — Playwright owns e2e/ (see playwright.config.ts).
export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
});
