variable "name" { type = string }
variable "project" { type = string }
variable "region" { type = string }
variable "retention_days" {
  # 0 disables lifecycle deletion; retention is customer-policy driven (rules.md §14)
  type    = number
  default = 0
}

resource "google_storage_bucket" "bucket" {
  name                        = var.name
  project                     = var.project
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning { enabled = true }

  dynamic "lifecycle_rule" {
    for_each = var.retention_days > 0 ? [1] : []
    content {
      action { type = "Delete" }
      condition { age = var.retention_days }
    }
  }
}

output "bucket_name" { value = google_storage_bucket.bucket.name }
