import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  // PGlite is intentionally single-process. CI's real-Postgres job covers concurrent DB/RLS;
  // browser journeys run serially so they share one deterministic local application state.
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: {
    command: "SIGNUPS_ENABLED=1 pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
