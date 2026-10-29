import { defineConfig, devices } from '@playwright/test'

// End-to-end checks in a real browser at the Galaxy Tab S10 sizes the app is built for (landscape only).
// A separate dev server on 5175, so it never clashes with the one used on the tablet.
const PORT = 5175

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `https://localhost:${PORT}`,
    // The dev server uses a self-signed certificate (Web MIDI needs HTTPS on the tablet).
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'tab-s10-plus', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 800 } } },
    { name: 'tab-s10-fe', use: { ...devices['Desktop Chrome'], viewport: { width: 1152, height: 650 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `https://localhost:${PORT}`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
