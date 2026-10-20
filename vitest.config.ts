import { defineConfig } from 'vitest/config';

// Unit tests only — Playwright owns e2e/ (see playwright.config.ts).
// terminal/ is its own package and runs its own suite.
export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', 'e2e/**', 'terminal/**'],
  },
});
