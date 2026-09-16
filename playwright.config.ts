import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Environment may already be configured. */
}
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
        (existsSync(chrome) ? chrome : undefined),
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
