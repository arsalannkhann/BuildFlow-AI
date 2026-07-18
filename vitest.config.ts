import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
  },
});
