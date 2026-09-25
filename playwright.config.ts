import { defineConfig, devices } from '@playwright/test';

/**
 * Cross-browser smoke tests (Milestone 9's missing browser pass): the real
 * app in Chromium, Firefox and WebKit (Safari's engine). Starts the dev
 * server and client itself, or reuses them if they're already running.
 *
 * Run: npm run test:e2e   (first time: npx playwright install)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: 'npm run dev -w server',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium falls back to SwiftShader (software WebGL), which
        // renders the room at a crawl; on Windows, ask for the real GPU.
        launchOptions: { args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
