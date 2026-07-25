import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // PGlite is intentionally single-process. CI's real-Postgres job covers concurrent DB/RLS;
  // browser journeys run serially so they share one deterministic local application state.
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: {
    command: `SIGNUPS_ENABLED=1 pnpm exec next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
