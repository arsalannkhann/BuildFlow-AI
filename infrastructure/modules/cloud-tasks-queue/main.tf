variable "name" { type = string }
variable "project" { type = string }
variable "region" { type = string }
variable "max_dispatches_per_second" {
  type    = number
  default = 10
}
variable "max_attempts" {
  type    = number
  default = 5
}

resource "google_cloud_tasks_queue" "queue" {
  name     = var.name
  project  = var.project
  location = var.region

  rate_limits {
    max_dispatches_per_second = var.max_dispatches_per_second
  }
  retry_config {
    max_attempts  = var.max_attempts
    min_backoff   = "5s"
    max_backoff   = "300s"
    max_doublings = 5
  }
}

output "queue_id" { value = google_cloud_tasks_queue.queue.id }
