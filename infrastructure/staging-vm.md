# Staging VM — fast-iteration environment

**Purpose:** second-scale deploys for iteration; production stays on Cloud Run behind the
full CI/CD gate. Staging carries SYNTHETIC DATA ONLY — dev auth, mock AI, local email
outbox — so speed never risks customer data or spend.

## Topology

- **VM:** `buildflow-staging` · `e2-standard-4` · `asia-south1-a` · Debian 12
  · external IP `34.14.159.96` (changes if the instance is recreated)
- **Web:** systemd `buildflow-web` → `next start` on `:3000` (firewall tag
  `buildflow-staging` allows tcp:3000)
- **Worker:** systemd `buildflow-worker` (`JOBS_MODE=worker`)
- **DB:** Docker `buildflow-pg` (pgvector/pg16) on `127.0.0.1:5432`, volume
  `buildflow-pgdata` — never production Cloud SQL
- **Env:** `/etc/buildflow/staging.env` (mock AI, local notify outbox, signups on,
  demo quick-login on)

## Deploy (the whole point)

```bash
git push staging main        # remote: /opt/buildflow/repo.git on the VM
```

The post-receive hook checks out to `/opt/buildflow/app`, runs
`pnpm install --frozen-lockfile`, builds the web app, and restarts both services.
First push ≈ minutes (cold install); subsequent pushes ≈ 1–2 min (warm caches).
Migrations apply automatically on service boot (same reviewed migration set as prod).

Remote setup on a new workstation:

```bash
gcloud compute config-ssh --project=buildflow-ai-502915
git remote add staging buildflow-staging.asia-south1-a.buildflow-ai-502915:/opt/buildflow/repo.git
```

## Operate

```bash
# logs
gcloud compute ssh buildflow-staging --zone=asia-south1-a -- 'journalctl -u buildflow-web -f'
gcloud compute ssh buildflow-staging --zone=asia-south1-a -- 'journalctl -u buildflow-worker -n 100'
# restart / status
gcloud compute ssh buildflow-staging --zone=asia-south1-a -- 'sudo systemctl restart buildflow-web'
# cost control — stop when idle (~$100/mo if left running 24/7)
gcloud compute instances stop  buildflow-staging --zone=asia-south1-a
gcloud compute instances start buildflow-staging --zone=asia-south1-a   # IP may change
```

## Promotion flow

1. Iterate: `git push staging main` until the change is verified on the VM.
2. Promote: `git push origin main` — the governed Cloud Run pipeline (full release gate,
   digest-pinned images, Cloud SQL migration job) takes it to production.
   Staging never deploys to prod; the two paths share nothing but the git history.

## Security posture (deliberate)

- Synthetic/demo data only; `AUTH_PROVIDER=dev`, quick-login enabled — treat the
  environment as public. Never point it at production secrets, Cloud SQL, or the
  production GCS bucket.
- Port 3000 is open to the internet for review convenience; tighten the firewall rule's
  `source-ranges` to office/home IPs if that changes.
- To use Gemini on staging later: grant the VM's default service account
  `roles/aiplatform.user` and set `AI_PROVIDER=gemini` + `GOOGLE_CLOUD_PROJECT` in
  `/etc/buildflow/staging.env` (ADC works natively on GCE), then restart services.

## Teardown

```bash
gcloud compute instances delete buildflow-staging --zone=asia-south1-a
gcloud compute firewall-rules delete allow-buildflow-staging-web
```
