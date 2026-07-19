variable "name" { type = string }
variable "project" { type = string }
variable "region" { type = string }
variable "image" { type = string }
variable "service_account_email" { type = string }
variable "env" {
  type    = map(string)
  default = {}
}
variable "secret_env" {
  # name -> Secret Manager secret id; mounted as env var at latest version
  type    = map(string)
  default = {}
}
variable "min_instances" {
  type    = number
  default = 0
}
variable "max_instances" {
  type    = number
  default = 4
}
variable "allow_unauthenticated" {
  type    = bool
  default = false
}

resource "google_cloud_run_v2_service" "service" {
  name     = var.name
  project  = var.project
  location = var.region

  template {
    service_account = var.service_account_email
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    containers {
      image = var.image
      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "uri" { value = google_cloud_run_v2_service.service.uri }
