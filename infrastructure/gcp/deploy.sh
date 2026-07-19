#!/usr/bin/env bash

set -Eeuo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"
: "${IMAGE_TAG:?IMAGE_TAG must be set to an immutable source revision}"

readonly GCP_REGION="${GCP_REGION:-asia-south1}"
readonly ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-buildflow}"
readonly WEB_SERVICE="${WEB_SERVICE:-buildflow-web}"
readonly WORKER_POOL="${WORKER_POOL:-buildflow-worker}"
readonly MIGRATION_JOB="${MIGRATION_JOB:-buildflow-migrate}"
readonly SQL_INSTANCE="${SQL_INSTANCE:-buildflow-pg}"
readonly WEB_SERVICE_ACCOUNT="${WEB_SERVICE_ACCOUNT:-buildflow-web@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
readonly WORKER_SERVICE_ACCOUNT="${WORKER_SERVICE_ACCOUNT:-buildflow-worker@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
readonly CONNECTION_NAME="${GCP_PROJECT_ID}:${GCP_REGION}:${SQL_INSTANCE}"
readonly IMAGE_BASE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPOSITORY}"

if [[ ! "${IMAGE_TAG}" =~ ^[a-z0-9][a-z0-9._-]{0,127}$ ]]; then
  printf 'IMAGE_TAG must be a lowercase container tag; received %q\n' "${IMAGE_TAG}" >&2
  exit 2
fi

for command in gcloud curl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'Required command is unavailable: %s\n' "${command}" >&2
    exit 2
  fi
done

cd "${REPO_ROOT}"

printf 'Building commit %s in Google Cloud project %s...\n' "${IMAGE_TAG}" "${GCP_PROJECT_ID}"
gcloud builds submit \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=${GCP_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${IMAGE_TAG}" \
  .

web_digest="$(gcloud artifacts docker images describe \
  "${IMAGE_BASE}/web:${IMAGE_TAG}" \
  --project="${GCP_PROJECT_ID}" \
  --format='value(image_summary.digest)')"
worker_digest="$(gcloud artifacts docker images describe \
  "${IMAGE_BASE}/worker:${IMAGE_TAG}" \
  --project="${GCP_PROJECT_ID}" \
  --format='value(image_summary.digest)')"

if [[ -z "${web_digest}" || -z "${worker_digest}" ]]; then
  printf 'Cloud Build completed without resolvable image digests.\n' >&2
  exit 1
fi

readonly WEB_IMAGE="${IMAGE_BASE}/web@${web_digest}"
readonly WORKER_IMAGE="${IMAGE_BASE}/worker@${worker_digest}"
readonly RELEASE_LABELS="managed-by=github-actions,commit-sha=${IMAGE_TAG}"

printf 'Applying database migrations with %s...\n' "${WORKER_IMAGE}"
gcloud run jobs deploy "${MIGRATION_JOB}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --image="${WORKER_IMAGE}" \
  --command=pnpm \
  --args=--filter,@buildflow/db,db:migrate \
  --service-account="${WORKER_SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --execution-environment=gen2 \
  --cpu=1 \
  --memory=1Gi \
  --task-timeout=600s \
  --max-retries=0 \
  --labels="${RELEASE_LABELS}" \
  --quiet

gcloud run jobs execute "${MIGRATION_JOB}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --wait \
  --quiet

printf 'Deploying worker pool from %s...\n' "${WORKER_IMAGE}"
gcloud beta run worker-pools deploy "${WORKER_POOL}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --image="${WORKER_IMAGE}" \
  --service-account="${WORKER_SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --env-vars-file=infrastructure/gcp/worker.env.yaml \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,DELETION_RECEIPT_HMAC_KEY=DELETION_RECEIPT_HMAC_KEY:latest \
  --cpu=1 \
  --memory=1Gi \
  --scaling=1 \
  --labels="${RELEASE_LABELS}" \
  --quiet

printf 'Deploying web service from %s...\n' "${WEB_IMAGE}"
gcloud run deploy "${WEB_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --image="${WEB_IMAGE}" \
  --service-account="${WEB_SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --env-vars-file=infrastructure/gcp/web.env.yaml \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,SESSION_PEPPER=SESSION_PEPPER:latest,DELETION_RECEIPT_HMAC_KEY=DELETION_RECEIPT_HMAC_KEY:latest \
  --execution-environment=gen2 \
  --port=8080 \
  --cpu=1 \
  --memory=2Gi \
  --concurrency=20 \
  --timeout=300 \
  --min=0 \
  --max=3 \
  --cpu-boost \
  --ingress=all \
  --allow-unauthenticated \
  --labels="${RELEASE_LABELS}" \
  --quiet

web_url="$(gcloud run services describe "${WEB_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --format='value(status.url)')"
web_revision="$(gcloud run services describe "${WEB_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --format='value(status.latestReadyRevisionName)')"
worker_revision="$(gcloud beta run worker-pools describe "${WORKER_POOL}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --format='value(status.latestReadyRevisionName)')"

assert_http_status() {
  local path="$1"
  local expected="$2"
  local code=""

  for _attempt in {1..12}; do
    code="$(curl --silent --show-error --location \
      --output /dev/null \
      --write-out '%{http_code}' \
      "${web_url}${path}" || true)"
    if [[ "${code}" == "${expected}" ]]; then
      printf 'Smoke check passed: %s -> %s\n' "${path}" "${code}"
      return 0
    fi
    sleep 5
  done

  printf 'Smoke check failed: %s returned %s, expected %s\n' "${path}" "${code}" "${expected}" >&2
  return 1
}

assert_http_status / 200
assert_http_status /login 200
assert_http_status /signup 200
assert_http_status /api/v1/openapi.json 200

login_code="$(curl --silent --show-error \
  --output /dev/null \
  --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --data "{\"email\":\"deploy-${IMAGE_TAG}@example.invalid\",\"password\":\"invalid-deployment-smoke-password\"}" \
  "${web_url}/api/v1/auth/login")"

if [[ "${login_code}" != "401" ]]; then
  printf 'Database-backed auth smoke returned %s, expected 401.\n' "${login_code}" >&2
  exit 1
fi
printf 'Smoke check passed: database-backed invalid login -> 401\n'

printf 'Deployment complete: %s (%s), worker %s\n' \
  "${web_url}" "${web_revision}" "${worker_revision}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'web_url=%s\n' "${web_url}"
    printf 'web_revision=%s\n' "${web_revision}"
    printf 'worker_revision=%s\n' "${worker_revision}"
    printf 'web_image=%s\n' "${WEB_IMAGE}"
    printf 'worker_image=%s\n' "${WORKER_IMAGE}"
  } >>"${GITHUB_OUTPUT}"
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    printf '## Production deployment\n\n'
    printf -- '- Commit: `%s`\n' "${IMAGE_TAG}"
    printf -- '- Web revision: `%s`\n' "${web_revision}"
    printf -- '- Worker revision: `%s`\n' "${worker_revision}"
    printf -- '- URL: %s\n' "${web_url}"
  } >>"${GITHUB_STEP_SUMMARY}"
fi
