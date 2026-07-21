const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './projects/tests/browser',
  timeout: 20_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node projects/tests/serve-static-app.js',
    url: 'http://127.0.0.1:4173/projects',
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
