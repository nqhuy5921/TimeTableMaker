import { defineConfig } from '@playwright/test';

// Runs against the built app in out/. Use `npm run test:e2e`, which builds first.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
});
