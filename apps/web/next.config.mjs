/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "playwright"],
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
        pg: "commonjs pg",
      });
    }
    return config;
  },
};
export default nextConfig;
