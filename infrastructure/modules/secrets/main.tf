variable "project" { type = string }
variable "names" {
  # Secret NAMES only — values are added out-of-band, never through IaC (rules.md §15)
  type = list(string)
}

resource "google_secret_manager_secret" "secret" {
  for_each  = toset(var.names)
  project   = var.project
  secret_id = each.value
  replication {
    auto {}
  }
}

output "secret_ids" { value = { for k, s in google_secret_manager_secret.secret : k => s.id } }
