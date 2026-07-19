#!/usr/bin/env bash

set -Eeuo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set as owner/repository}"

readonly GCP_REGION="${GCP_REGION:-asia-south1}"
readonly POOL_ID="${POOL_ID:-github-actions}"
readonly PROVIDER_ID="${PROVIDER_ID:-buildflow-ai}"
readonly DEPLOY_SERVICE_ACCOUNT_NAME="${DEPLOY_SERVICE_ACCOUNT_NAME:-buildflow-github-deploy}"
readonly DEPLOY_SERVICE_ACCOUNT="${DEPLOY_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

for command in gcloud gh; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'Required command is unavailable: %s\n' "${command}" >&2
    exit 2
  fi
done

project_number="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"
repository_id="$(gh api "repos/${GITHUB_REPOSITORY}" --jq '.id')"
repository_owner_id="$(gh api "repos/${GITHUB_REPOSITORY}" --jq '.owner.id')"

if ! gcloud iam service-accounts describe "${DEPLOY_SERVICE_ACCOUNT}" \
  --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${DEPLOY_SERVICE_ACCOUNT_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --display-name="BuildFlow GitHub production deployer"
fi

if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project="${GCP_PROJECT_ID}" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project="${GCP_PROJECT_ID}" \
    --location=global \
    --display-name="GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${GCP_PROJECT_ID}" \
  --location=global \
  --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${GCP_PROJECT_ID}" \
    --location=global \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="BuildFlow AI main branch" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository_id=='${repository_id}' && assertion.repository_owner_id=='${repository_owner_id}' && assertion.ref=='refs/heads/main'"
else
  gcloud iam workload-identity-pools providers update-oidc "${PROVIDER_ID}" \
    --project="${GCP_PROJECT_ID}" \
    --location=global \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="BuildFlow AI main branch" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository_id=='${repository_id}' && assertion.repository_owner_id=='${repository_owner_id}' && assertion.ref=='refs/heads/main'"
fi

pool_name="$(gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project="${GCP_PROJECT_ID}" \
  --location=global \
  --format='value(name)')"
provider_name="$(gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${GCP_PROJECT_ID}" \
  --location=global \
  --workload-identity-pool="${POOL_ID}" \
  --format='value(name)')"
readonly workload_member="principalSet://iam.googleapis.com/${pool_name}/attribute.repository_id/${repository_id}"

gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SERVICE_ACCOUNT}" \
  --project="${GCP_PROJECT_ID}" \
  --role=roles/iam.workloadIdentityUser \
  --member="${workload_member}" \
  --quiet >/dev/null

for role in \
  roles/cloudbuild.builds.editor \
  roles/run.admin \
  roles/artifactregistry.reader \
  roles/cloudsql.viewer \
  roles/secretmanager.viewer \
  roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SERVICE_ACCOUNT}" \
    --role="${role}" \
    --condition=None \
    --quiet >/dev/null
done

for runtime_service_account in \
  "buildflow-web@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  "buildflow-worker@${GCP_PROJECT_ID}.iam.gserviceaccount.com"; do
  gcloud iam service-accounts add-iam-policy-binding "${runtime_service_account}" \
    --project="${GCP_PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SERVICE_ACCOUNT}" \
    --role=roles/iam.serviceAccountUser \
    --quiet >/dev/null
done

cloud_build_service_account="$(gcloud builds get-default-service-account \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}")"
gcloud iam service-accounts add-iam-policy-binding "${cloud_build_service_account}" \
  --project="${GCP_PROJECT_ID}" \
  --member="serviceAccount:${DEPLOY_SERVICE_ACCOUNT}" \
  --role=roles/iam.serviceAccountUser \
  --quiet >/dev/null

gh variable set GCP_PROJECT_ID --repo="${GITHUB_REPOSITORY}" --body="${GCP_PROJECT_ID}"
gh variable set GCP_REGION --repo="${GITHUB_REPOSITORY}" --body="${GCP_REGION}"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --repo="${GITHUB_REPOSITORY}" --body="${provider_name}"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT \
  --repo="${GITHUB_REPOSITORY}" --body="${DEPLOY_SERVICE_ACCOUNT}"
gh api --method PUT "repos/${GITHUB_REPOSITORY}/environments/production" >/dev/null

printf 'CI/CD bootstrap complete.\n'
printf 'Project number: %s\n' "${project_number}"
printf 'Repository ID: %s\n' "${repository_id}"
printf 'Repository owner ID: %s\n' "${repository_owner_id}"
printf 'Workload Identity provider: %s\n' "${provider_name}"
printf 'Deployment service account: %s\n' "${DEPLOY_SERVICE_ACCOUNT}"
