import { defineConfig } from '@playwright/test'

// Point this exclusively at the disposable browser fixture container (see docs).
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/setup.js',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    browserName: 'chromium',
    launchOptions: { channel: 'msedge' },
    viewport: { width: 1440, height: 1080 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: { VITE_API_URL: 'http://localhost:8092/api' },
  },
})
