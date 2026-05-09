import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.OWNLOOM_GATEWAY_WEB_E2E_PORT ?? "18090");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && node server.mjs",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      OWNLOOM_GATEWAY_WEB_HOST: "127.0.0.1",
      OWNLOOM_GATEWAY_WEB_PORT: String(port),
      OWNLOOM_GATEWAY_URL: "http://127.0.0.1:18081",
      OWNLOOM_RADICALE_URL: "http://127.0.0.1:18083",
      OWNLOOM_TERMINAL_TOKEN_FILE: "tests/fixtures/terminal-token.txt",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
