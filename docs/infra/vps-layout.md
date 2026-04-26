# Canonical VPS Layout

VPS: `45.97.140.41` — all services run as `marwanelzaher`.

**Every ops script must derive its paths from this document.** Do not guess or assume; wrong paths create stray files that are silently ignored by Docker Compose.

## Base directory

```
/home/marwanelzaher/ai-company/
```

Each service lives in its own subdirectory under this base.

## Service directories, compose files, and env files

| Service / stack      | Directory                                  | Compose file                                      | Env file                                   |
|----------------------|--------------------------------------------|---------------------------------------------------|--------------------------------------------|
| n8n + Traefik        | `n8n/`                                     | `docker-compose.yml`                              | `.env`                                     |
| RAGFlow              | `ragflow/docker/`                           | `docker-compose.yml`                              | `.env`                                     |
| maroslab-app         | `maros-lab-starter/`                        | `docker-compose.prod.yml`                         | `.env` (repo root)                         |
| maroslab-copilotkit  | `maros-lab-starter/`                        | `docker/docker-compose.copilotkit.yml`            | `docker/.env`                              |
| maroslab-rfp-analyzer| `maros-lab-starter/`                        | `docker/docker-compose.rfp-analyzer.yml`          | `docker/.env.rfp-analyzer`                 |
| maroslab-reminders   | `maros-lab-starter/`                        | `docker/docker-compose.reminders.yml`             | `docker/.env.reminders`                    |
| maroslab-langfuse    | `maros-lab-starter/`                        | `docker/docker-compose.langfuse.yml`              | `docker/.env.langfuse`                     | image: `langfuse/langfuse:2` (pinned; v3 needs ClickHouse+Redis+S3 — MAR-84) |

**Key rule:** The `maros-lab-starter` stacks are run from the repo clone at  
`/home/marwanelzaher/ai-company/maros-lab-starter/` — **not** from per-service subdirectories.  
The env file for each stack lives alongside its compose file inside `docker/`, not at the repo root (except `docker-compose.prod.yml` which is at root and reads `.env` from root).

## Service names per stack

| Compose file                              | Service names               |
|-------------------------------------------|-----------------------------|
| `docker-compose.prod.yml`                 | `app`, `minio`, `minio-init`|
| `docker/docker-compose.copilotkit.yml`    | `copilotkit`, `postgres`    |
| `docker/docker-compose.rfp-analyzer.yml`  | `rfp-analyzer`              |
| `docker/docker-compose.reminders.yml`     | `waha`, `cloudflared-reminders` |
| `docker/docker-compose.langfuse.yml`      | `langfuse`, `langfuse-db`   |

## Network topology

| Docker network   | Created by         | Purpose                                                     |
|------------------|--------------------|-------------------------------------------------------------|
| `n8n_default`    | n8n stack          | Primary shared network — all maroslab services attach here  |
| `docker_ragflow` | RAGFlow stack      | RAGFlow internal network (ragflow-cpu, infinity, minio, mysql, redis) |

Neither network is created by this repo. Both must exist before any `docker compose up`.  
See [network-topology.md](../network-topology.md) for the full bring-up order.

## Canonical docker compose commands (run from repo root)

```bash
REPO_DIR="/home/marwanelzaher/ai-company/maros-lab-starter"
cd "$REPO_DIR"

# copilotkit
docker compose -f docker/docker-compose.copilotkit.yml up -d --force-recreate copilotkit

# rfp-analyzer
docker compose -f docker/docker-compose.rfp-analyzer.yml --env-file docker/.env.rfp-analyzer up -d --build --force-recreate

# maroslab-app (root compose)
docker compose -f docker-compose.prod.yml up -d --force-recreate app

# langfuse (first deploy; run once after creating docker/.env.langfuse)
docker compose -f docker/docker-compose.langfuse.yml --env-file docker/.env.langfuse up -d
```

## Ops script checklist

Before writing any VPS ops script, verify:

1. `ENV_FILE` is the path listed in the table above for the target stack.
2. `COMPOSE_FILE` is the compose file listed above (absolute path or `-f <relative>` from `$REPO_DIR`).
3. The service name in `docker compose up ... <service>` matches the **Service names** table.
4. The script is idempotent — running it twice should not corrupt the env file or leave duplicate keys.
5. The script is committed to the repo (no manual SSH mutations that aren't in a committed script).
