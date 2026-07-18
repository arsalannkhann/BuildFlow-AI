import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// Tasks run with different cwds (repo root, apps/web under `next dev`, package dirs under
// turbo), so cwd-relative defaults would scatter data directories. Anchor them on the
// workspace root instead. BUILDFLOW_REPO_ROOT overrides for deployed containers where the
// workspace file may not ship.
export function workspaceRoot(start = process.cwd()): string {
  const override = process.env.BUILDFLOW_REPO_ROOT;
  if (override) return override;
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function migrationsDir(): string {
  return join(workspaceRoot(), "packages", "db", "drizzle");
}
