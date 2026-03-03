---
name: apply-linux
description: Apply Linux-specific fix for Docker networking. Use when setting up or running MinClaw on Linux/Ubuntu and Docker can't reach the host. Triggers on "apply linux", "linux fixes", "linux docker fix", "ubuntu", "ubuntu fix".
---

# Apply Linux Fix

On Linux, Docker uses separate network namespaces — `127.0.0.1` inside a container is the container itself, not the host. The fix is to switch the agent container to host networking.

## Diagnostic

```bash
echo "=== Linux Diagnostic ==="

echo -e "\n1. docker-compose.yml uses host networking?"
grep -q "network_mode: host" docker-compose.yml && echo "YES" || echo "NO — needs patching"

echo -e "\n2. Agent can reach host?"
docker exec $(docker ps -qf name=minclaw) curl -s http://127.0.0.1:13821/health 2>/dev/null || echo "UNREACHABLE (container may not be running)"
```

## Merge

Snapshots the repo to `bases/` (first time only via `git archive`), then three-way merges — user edits outside the patched regions are preserved.

```bash
SKILL=.claude/skills/apply-linux

[ -d bases ] || (mkdir -p bases && git archive HEAD | tar -x -C bases/)

git merge-file docker-compose.yml bases/docker-compose.yml "$SKILL/files/docker-compose.yml"
```

If exit code is non-zero, conflict markers (`<<<<<<<`) were inserted — resolve before continuing.

| File                 | What changes                                                          |
|----------------------|-----------------------------------------------------------------------|
| `docker-compose.yml` | `network_mode: host`, drop `ports`/`extra_hosts`, fix `HOST_URL`      |

## After merging

```bash
pnpm stop && pnpm start
```

## Proxy on Linux?

Use the `/apply-proxy` skill — it covers Docker build proxy, container runtime proxy, and Docker daemon systemd configuration.
