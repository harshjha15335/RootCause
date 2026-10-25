import { defineConfig } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT || "5188";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
