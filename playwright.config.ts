import { defineConfig, devices } from '@playwright/test';

// Browser checks of the built widget (spec 004 T4/T5): run `npm run build` first.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node e2e/serve.mjs', url: 'http://localhost:4173/widget', reuseExistingServer: !process.env.CI },
});
