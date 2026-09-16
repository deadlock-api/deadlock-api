import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: 2,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4318",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: [
    {
      command: "pnpm exec tsx tests/browser/mock-api.ts",
      url: "http://127.0.0.1:4319/health",
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 4318 --strictPort",
      url: "http://127.0.0.1:4318",
      env: { VITE_API_BASE_URL: "http://127.0.0.1:4319" },
      timeout: 60_000,
    },
  ],
});
