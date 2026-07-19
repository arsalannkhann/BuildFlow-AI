import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    // PGlite-backed integration tests share CPU during the full monorepo run.
    // Keep a bounded allowance that is stable on CI without weakening assertions.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
  },
});
