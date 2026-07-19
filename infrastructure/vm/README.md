# Production on the VM

Production runs entirely on one Compute Engine VM. Cloud Run was retired on 2026-07-20.

## Topology

| Piece | What it is |
|---|---|
| `buildflow` (`e2-standard-4`, `asia-south1-a`) | the production host; static IP `34.14.159.96` (`buildflow-prod-ip`) |
| `buildflow-web-1` | Next.js standalone server (`web-vm` Docker target, bundles Chromium for issued PDFs) |
| `buildflow-worker-1` | job worker (`JOBS_MODE=worker`) |
| `buildflow-sql-proxy-1` | Cloud SQL Auth Proxy → `buildflow-ai-502915:asia-south1:buildflow-pg` |
| `buildflow-caddy-1` | TLS terminator / reverse proxy for `bronn.dev` (automatic Let's Encrypt) |

State lives in Cloud SQL and the GCS evidence bucket; containers are disposable.
Config: `/etc/buildflow/production.env` on the host (root-only, 600).

## Deploy

```bash
git push staging main       # checkout -> docker compose build -> up -d
```

The post-receive hook in `/opt/buildflow/repo.git` syncs the working tree to
`/home/arsalan/buildflow` (IDE-friendly location) with `read-tree --reset` — a plain
`checkout -f` silently no-ops when the bare repo HEAD is already on main — then builds and
rolls the containers (~2-4 min).
Migrations apply automatically when the web container boots.

## Operate

```bash
ssh buildflow                                     # shell on the host
ssh buildflow 'sudo docker logs -f buildflow-web-1'     # web logs
ssh buildflow 'sudo docker logs -f buildflow-worker-1'  # worker logs
ssh buildflow 'cd /home/arsalan/buildflow && sudo docker compose -f docker-compose.production.yml ps'
ssh buildflow 'cd /home/arsalan/buildflow && sudo docker compose -f docker-compose.production.yml restart web'
```

## DNS for bronn.dev

Point these at the VM, then Caddy issues certificates automatically on first request:

| Type | Name | Value |
|---|---|---|
| A | `@` | `34.14.159.96` |
| A | `www` | `34.14.159.96` |

Keep the Resend verification records (TXT/MX for `send`, DKIM) — email sending from
`no-reply@bronn.dev` depends on them and is unaffected by the A records above.

Until DNS moves, production is reachable at `http://34.14.159.96:3000`.

## Notes

- Port 3000 is open for direct checks; once DNS is live, restrict it to your IPs and let
  public traffic arrive through 80/443 only.
- `docker system prune -f` on the host reclaims old build layers when disk gets tight.
