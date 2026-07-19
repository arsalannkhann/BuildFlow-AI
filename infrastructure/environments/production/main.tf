terraform {
  required_version = ">= 1.6"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
  backend "gcs" {
    bucket = "buildflow-tofu-state-production"
    prefix = "production"
  }
}

variable "project" { type = string }
variable "web_image" { type = string }
variable "worker_image" { type = string }
variable "supabase_url" { type = string }
variable "supabase_storage_bucket" { type = string }

locals {
  region = "asia-south1" # Mumbai — approved India region (Architecture.MD §6)
}

provider "google" {
  project = var.project
  region  = local.region
}

resource "google_service_account" "web" {
  account_id   = "buildflow-web"
  display_name = "BuildFlow web/API runtime"
}

resource "google_service_account" "worker" {
  account_id   = "buildflow-worker"
  display_name = "BuildFlow background worker"
}

module "secrets" {
  source  = "../../modules/secrets"
  project = var.project
  names = [
    "DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "SESSION_PEPPER",
    "DELETION_RECEIPT_HMAC_KEY",
  ]
}

module "evidence_bucket" {
  source  = "../../modules/storage-bucket"
  project = var.project
  region  = local.region
  name    = "${var.project}-buildflow-evidence"
}

module "jobs_queue" {
  source  = "../../modules/cloud-tasks-queue"
  project = var.project
  region  = local.region
  name    = "buildflow-jobs"
}

module "web" {
  source                = "../../modules/cloud-run-service"
  project               = var.project
  region                = local.region
  name                  = "buildflow-web"
  image                 = var.web_image
  service_account_email = google_service_account.web.email
  allow_unauthenticated = true
  min_instances         = 1
  env = {
    NODE_ENV                   = "production"
    JOBS_MODE                  = "worker"
    AI_PROVIDER                = "openai"
    SUPABASE_URL               = var.supabase_url
    SUPABASE_STORAGE_BUCKET    = var.supabase_storage_bucket
  }
  secret_env = {
    DATABASE_URL              = "DATABASE_URL"
    SUPABASE_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY"
    OPENAI_API_KEY            = "OPENAI_API_KEY"
  }
}

module "worker" {
  source                = "../../modules/cloud-run-service"
  project               = var.project
  region                = local.region
  name                  = "buildflow-worker"
  image                 = var.worker_image
  service_account_email = google_service_account.worker.email
  min_instances         = 1
  max_instances         = 2
  env = {
    NODE_ENV                   = "production"
    AI_PROVIDER                = "openai"
    SUPABASE_URL               = var.supabase_url
    SUPABASE_STORAGE_BUCKET    = var.supabase_storage_bucket
  }
  secret_env = {
    DATABASE_URL                = "DATABASE_URL"
    OPENAI_API_KEY              = "OPENAI_API_KEY"
    SUPABASE_SERVICE_ROLE_KEY   = "SUPABASE_SERVICE_ROLE_KEY"
    DELETION_RECEIPT_HMAC_KEY   = "DELETION_RECEIPT_HMAC_KEY"
  }
}

output "web_uri" { value = module.web.uri }
