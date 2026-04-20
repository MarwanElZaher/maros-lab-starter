# CopilotKit Reconciler — Rollback Guide

## Pinning to a previous digest

If a bad image ships, stop the reconciler from auto-pulling, then restore the last known-good container.

### Step 1 — Stop the timer

```bash
sudo systemctl stop copilotkit-reconciler.timer
```

### Step 2 — Find the good digest

List recently pulled images (newest first):

```bash
docker images --digests ghcr.io/marwanelzaher/maros-lab-starter-copilotkit
```

Or look at reconciler logs to find the last `no-change` digest:

```bash
journalctl -u copilotkit-reconciler.service --since "1 hour ago" | grep "no-change\|updated"
```

### Step 3 — Pin the image in the env file

Edit `/etc/default/copilotkit-reconciler`:

```
# Pin to a specific digest to prevent auto-updates
COPILOTKIT_IMAGE=ghcr.io/marwanelzaher/maros-lab-starter-copilotkit@sha256:<good-digest>
```

### Step 4 — Restart the service with the pinned image

```bash
COMPOSE_FILE=/home/marwanelzaher/ai-company/copilotkit/docker-compose.yml
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d copilotkit
```

### Step 5 — Verify and re-enable the timer once the fix ships

After the fixed image is published to GHCR, restore the tag in the env file:

```
COPILOTKIT_IMAGE=ghcr.io/marwanelzaher/maros-lab-starter-copilotkit:latest
```

Then re-enable:

```bash
sudo systemctl start copilotkit-reconciler.timer
```

## Emergency: revert to a specific SHA commit image

GitHub Actions pushes both `:latest` and `:<commit-sha>` tags. To roll back to any previous commit:

```bash
COPILOTKIT_IMAGE=ghcr.io/marwanelzaher/maros-lab-starter-copilotkit:<commit-sha>
```

Replace `<commit-sha>` with the 40-char Git SHA from `git log` or the GitHub Actions run that produced the last good build.
