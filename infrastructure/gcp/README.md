# Google Cloud production deployment

The live MVP uses project `buildflow-ai-502915` and region `asia-south1` for application
compute, PostgreSQL and evidence storage. Vertex AI uses the `global` endpoint because Gemini
model availability is controlled independently from the application data region.

## Managed resources

- `buildflow-web` — public Cloud Run service, scaling from zero.
- `buildflow-worker` — one-instance Cloud Run worker pool for the database-backed queue.
- `buildflow-migrate` — Cloud Run job used explicitly before application rollout.
- `buildflow-pg` — Cloud SQL PostgreSQL 16, zonal MVP tier, automatic backups and PITR.
- `buildflow-ai-502915-buildflow-evidence` — private, uniform-access, versioned GCS bucket.
- `buildflow` — regional Artifact Registry Docker repository.
- `buildflow-web` and `buildflow-worker` — separate workload service accounts.
- `DATABASE_URL`, `SESSION_PEPPER`, and `DELETION_RECEIPT_HMAC_KEY` — Secret Manager names;
  secret values are intentionally absent from source and command examples.

No VM, Kubernetes cluster, graph database, external vector database, or long-lived Google
service-account key is used.

## Build

Use an immutable tag and deploy the resolved digest, never `latest`:

```bash
gcloud builds submit \
  --project buildflow-ai-502915 \
  --region asia-south1 \
  --config cloudbuild.yaml \
  --substitutions _IMAGE_TAG=prod-YYYYMMDD-NN .
```

`cloudbuild.yaml` produces separate `web` and `worker` targets. The web image includes the
matching Playwright runtime needed for PDF issuance.

## Deploy order

1. Resolve the two Artifact Registry tags to immutable digests.
2. Deploy and execute `buildflow-migrate` with the worker digest, Cloud SQL attachment and
   `DATABASE_URL` secret.
3. Deploy `buildflow-web` with `web.env.yaml`, Cloud SQL attachment and the three managed
   secrets.
4. Deploy `buildflow-worker` with `worker.env.yaml`, the same database attachment and relevant
   managed secrets.
5. Verify `/login`, `/signup`, `/api/v1/openapi.json`, registration, worker logs, GCS access and
   a synthetic Gemini structured-output request.

Rollback uses the previous Artifact Registry digest. Migrations are forward-compatible and
providers remain selectable through environment variables.

## Continuous delivery

`.github/workflows/ci.yml` is the production delivery controller:

1. pull requests and `main` pushes run the secret scan, 15-package typecheck, Vitest suite,
   production build, browser journeys, mobile sync tests and a real PostgreSQL migration/RLS
   check;
2. the production job is available only on a non-PR `main` run and depends on all four CI jobs;
3. GitHub exchanges its short-lived OIDC token for the
   `buildflow-github-deploy@buildflow-ai-502915.iam.gserviceaccount.com` identity;
4. `deploy.sh` builds both images with the Git commit SHA as the tag, resolves immutable
   digests, executes the migration job, deploys the worker pool, deploys the web service and
   runs live HTTP/database-backed auth smoke checks;
5. production deployments are serialized and a running release is never cancelled. Every
   `main` push starts a gated run; if GitHub coalesces several pending runs, the newest verified
   commit becomes the next production release.

The Workload Identity provider accepts only the immutable GitHub repository ID `1298680750`,
owner ID `167637419` and `refs/heads/main`. No Google service-account key or provider credential
is stored in GitHub. Repository variables contain only non-secret resource identifiers:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

The deployer has Cloud Build editor, Cloud Run administrator, Artifact Registry reader, Cloud
SQL viewer, Secret Manager viewer, Storage Bucket viewer and Service Usage consumer roles. The
bucket viewer can only discover bucket names and metadata. On the Cloud Build source bucket,
the deployer can manage the temporary source archives required by `gcloud builds submit`; it
cannot administer that bucket or its IAM policy. It can act as only the two BuildFlow runtime
service accounts when updating Cloud Run and as the project's Cloud Build execution account
when submitting a build. Runtime access to database credentials, evidence and Gemini remains
on the runtime identities rather than the GitHub identity.

The same release path can be invoked manually from an authenticated workstation:

```bash
GCP_PROJECT_ID=buildflow-ai-502915 \
GCP_REGION=asia-south1 \
IMAGE_TAG="$(git rev-parse HEAD)" \
./infrastructure/gcp/deploy.sh
```

To recreate the keyless trust, least-privilege IAM bindings, GitHub variables and production
environment from authenticated `gcloud` and `gh` sessions, run:

```bash
GCP_PROJECT_ID=buildflow-ai-502915 \
GCP_REGION=asia-south1 \
GITHUB_REPOSITORY=arsalannkhann/BuildFlow-AI \
./infrastructure/gcp/bootstrap-cicd.sh
```

The script intentionally has no `latest` path and stops immediately on a failed build,
migration, rollout or smoke check. A failed deployment leaves the last ready Cloud Run revision
available for an explicit digest rollback.
