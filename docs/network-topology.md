# VPS Docker Network Topology

## Networks

| Docker network    | Owner compose project | Purpose |
|-------------------|-----------------------|---------|
| `n8n_default`     | n8n stack (`/home/marwanelzaher/ai-company/n8n/`) | Primary shared network — all maroslab services attach here so they can reach n8n, Traefik, and each other |
| `docker_ragflow`  | RAGFlow stack (`/home/marwanelzaher/ai-company/ragflow/docker/`) | RAGFlow internal network — contains ragflow-cpu, infinity, minio, mysql, redis |

Neither network is created by this repo. Both must exist before any `docker compose up`.

## Services and their networks

### maroslab-app (`docker-compose.prod.yml`)

| Service      | Networks       | Exposed endpoint |
|--------------|----------------|-----------------|
| `app`        | `n8n_default`  | `https://<APP_HOST>` via Traefik |
| `minio`      | `n8n_default`  | `https://<MINIO_CONSOLE_HOST>` via Traefik (console); `http://minio:9000` (internal S3 API) |
| `minio-init` | `n8n_default`  | one-shot bucket init, exits |

### maroslab-copilotkit (`docker-compose.copilotkit.yml`)

| Service      | Networks                        | Exposed endpoint |
|--------------|---------------------------------|-----------------|
| `postgres`   | `n8n_default`                   | `postgres:5432` (internal only) |
| `copilotkit` | `n8n_default`, `docker_ragflow` | `https://rfp.marwanelzaher.info` via Traefik |

`copilotkit` is on both networks so it can reach:
- `n8n:5678` (webhook trigger) and `minio:9000` (PDF storage) via `n8n_default`
- RAGFlow internal services on `docker_ragflow`

### maroslab-rfp-analyzer (`docker-compose.rfp-analyzer.yml`)

| Service        | Networks      | Exposed endpoint |
|----------------|---------------|-----------------|
| `rfp-analyzer` | `n8n_default` | `http://rfp-analyzer:3000` (internal only; n8n calls this) |

### maroslab-reminders (`docker-compose.reminders.yml`)

| Service                 | Networks      | Exposed endpoint |
|-------------------------|---------------|-----------------|
| `waha`                  | `n8n_default` | internal only (n8n calls `http://waha:3000`) |
| `cloudflared-reminders` | `n8n_default` | Cloudflare Tunnel for `reminders.marwanelzaher.info` |

## External endpoints and which network to reach them on

| Endpoint               | Docker DNS name    | Network         | Notes |
|------------------------|--------------------|-----------------|-------|
| n8n                    | `n8n:5678`         | `n8n_default`   | Managed by the n8n compose project |
| Traefik reverse proxy  | `traefik:80/443`   | `n8n_default`   | All public hostnames route through here |
| MinIO (maroslab)       | `minio:9000`       | `n8n_default`   | S3-compatible; console at `:9001` |
| RAGFlow API            | `ragflow-cpu:9380` | `docker_ragflow`| Also reachable at `https://ragflow.marwanelzaher.info` |
| RAGFlow MinIO          | `minio:9000`       | `docker_ragflow`| RAGFlow's own MinIO; distinct from maroslab MinIO |
| rfp-analyzer           | `rfp-analyzer:3000`| `n8n_default`   | Called by n8n LangGraph webhook |
| WAHA (WhatsApp)        | `waha:3000`        | `n8n_default`   | Called by n8n reminder workflows |

## Fresh-VPS bring-up order

Run these in order on a clean VPS. Each step creates a network used by subsequent steps.

```bash
# 1. n8n stack — creates n8n_default, starts Traefik + n8n
cd /home/marwanelzaher/ai-company/n8n
docker compose up -d

# 2. RAGFlow stack — creates docker_ragflow, starts ragflow-cpu, infinity, minio, mysql, redis
cd /home/marwanelzaher/ai-company/ragflow/docker
docker compose up -d

# 3. maroslab-app — attaches to n8n_default, starts MinIO + main Next.js app
cd /home/marwanelzaher/ai-company/maros-lab-starter
docker compose -f docker-compose.prod.yml --env-file .env up -d

# 4. maroslab-rfp-analyzer — attaches to n8n_default
docker compose -f docker/docker-compose.rfp-analyzer.yml --env-file .env.rfp-analyzer up -d --build

# 5. maroslab-copilotkit — attaches to n8n_default AND docker_ragflow
cd /home/marwanelzaher/ai-company/copilotkit
docker compose -f docker/docker-compose.copilotkit.yml --env-file .env up -d

# 6. maroslab-reminders (optional) — attaches to n8n_default
docker compose -f docker/docker-compose.reminders.yml --env-file .env.reminders up -d
```

No `docker network connect` commands should be needed after this sequence.

## Isolation guarantee

Each compose project declares every network it uses as `external: true`. Bringing down any one stack does not remove the shared networks, so the remaining stacks stay connected and operational. Never pass `--remove-orphans` on a shared-network stack — it can disconnect containers from other projects.
