import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// Duplicated from @buildflow/storage/workspace-root to keep path resolution identical
// without a package dependency: anchors cwd-relative outbox paths on the workspace root
// so different task cwds (repo root, apps/web, package dirs) share one outbox.
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
