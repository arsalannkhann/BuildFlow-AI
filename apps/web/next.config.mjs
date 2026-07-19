import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Next defaults output tracing to apps/web. Provider and database packages are installed at
  // the pnpm workspace root, so production standalone images must trace from the monorepo root.
  outputFileTracingRoot: join(appDir, "../.."),
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@google-cloud/storage",
    "@google/genai",
    "playwright",
  ],
  transpilePackages: [
    "@buildflow/ai",
    "@buildflow/auth",
    "@buildflow/contracts",
    "@buildflow/db",
    "@buildflow/domain",
    "@buildflow/jobs",
    "@buildflow/pdf",
    "@buildflow/pipeline",
    "@buildflow/storage",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // serverExternalPackages does not externalize playwright when it is reached
      // through a transpiled workspace package's ESM import, so force it here.
      config.externals.push({
        playwright: "commonjs playwright",
        "playwright-core": "commonjs playwright-core",
        "@electric-sql/pglite": "commonjs @electric-sql/pglite",
      });
    }
    return config;
  },
};
export default nextConfig;
