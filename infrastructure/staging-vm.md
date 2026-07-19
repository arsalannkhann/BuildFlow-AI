# Staging VM — fast-iteration environment

**Purpose:** second-scale deploys for iteration. **Since 2026-07-20 this VM shares the
PRODUCTION resources** (Cloud SQL via Auth Proxy on 127.0.0.1:5433, the production GCS
evidence bucket, Gemini on Vertex, Resend email from bronn.dev) — it is a second
production frontend you can push to directly, per the darcm-style workflow. Demo
quick-login and demo seed are OFF.

**THE SHARP EDGE:** the app auto-migrates on boot. Pushing a migration-bearing commit to
this VM migrates the PRODUCTION database immediately. Only push schema changes here when
they are prod-ready; everything else iterates freely.

## Topology

- **VM:** `buildflow` · `e2-standard-4` · `asia-south1-a` · Debian 12
  · external IP `34.14.159.96` (changes if the instance is recreated)
- **Web:** systemd `buildflow-web` → `next start` on `:3000` (firewall tag
  `buildflow` allows tcp:3000)
- **Worker:** systemd `buildflow-worker` (`JOBS_MODE=worker`)
- **DB:** production Cloud SQL `buildflow-pg` through `cloud-sql-proxy.service`
  (127.0.0.1:5433, IAM-authenticated via the VM service account, cloud-platform scope)
- **Env:** `/etc/buildflow/staging.env` (root-only, 600) — production values: Gemini,
  GCS bucket, Resend, shared SESSION_PEPPER (sessions valid across VM and Cloud Run)
- The old local Docker Postgres was removed; its volume `buildflow-pgdata` remains for
  rollback to isolated-staging mode

## Deploy (the whole point)

```bash
git push staging main        # remote: /opt/buildflow/repo.git on the VM
```

The post-receive hook checks out to `/home/arsalan/buildflow`, runs
`pnpm install --frozen-lockfile`, builds the web app, and restarts both services.
First push ≈ minutes (cold install); subsequent pushes ≈ 1–2 min (warm caches).
Migrations apply automatically on service boot (same reviewed migration set as prod).

Remote setup on a new workstation:

```bash
gcloud compute config-ssh --project=buildflow-ai-502915
git remote add staging buildflow.asia-south1-a.buildflow-ai-502915:/opt/buildflow/repo.git
```

## Operate

```bash
# logs
gcloud compute ssh buildflow --zone=asia-south1-a -- 'journalctl -u buildflow-web -f'
gcloud compute ssh buildflow --zone=asia-south1-a -- 'journalctl -u buildflow-worker -n 100'
# restart / status
gcloud compute ssh buildflow --zone=asia-south1-a -- 'sudo systemctl restart buildflow-web'
# cost control — stop when idle (~$100/mo if left running 24/7)
gcloud compute instances stop  buildflow --zone=asia-south1-a
gcloud compute instances start buildflow --zone=asia-south1-a   # IP may change
```

## Workflow (darcm-style)

1. **IDE on the VM:** VS Code / Cursor → Remote-SSH → host `buildflow` → open
   `/home/arsalan/buildflow`. Edit and build in place (`pnpm --filter @buildflow/web build`,
   `sudo systemctl restart buildflow-web`), or keep editing locally and
   `git push staging main` (~1–2 min loop).
2. **Promote:** `git push origin main` — the governed Cloud Run pipeline re-verifies and
   ships the same commit to the managed frontend. Both frontends share one database, one
   bucket, one job queue; a session issued on one is valid on the other.

## Security posture (production data — act accordingly)

- This VM now serves REAL customer data with production credentials in its env file
  (root-only 600). Demo login and demo seed are disabled; signups mirror production.
- Port 3000 is open to the internet. Recommended next hardening: restrict the firewall
  rule to your IPs (`gcloud compute firewall-rules update allow-buildflow-web
  --source-ranges=<your-ip>/32`) and/or front it with IAP.
- Two workers (Cloud Run + VM) polling one job table is safe by design
  (FOR UPDATE SKIP LOCKED lease).

## Teardown

```bash
gcloud compute instances delete buildflow --zone=asia-south1-a
gcloud compute firewall-rules delete allow-buildflow-web
```
