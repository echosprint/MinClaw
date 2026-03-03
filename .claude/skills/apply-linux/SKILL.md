---
name: apply-linux
description: Apply Linux-specific fixes for Docker networking and proxy. Use when setting up or running MinClaw on Linux/Ubuntu and Docker can't reach the host or builds fail behind a proxy. Triggers on "apply linux", "linux fixes", "linux docker fix", "ubuntu", "ubuntu fix".
---

# Apply Linux Fixes

MinClaw was originally developed on macOS where Docker Desktop runs inside a VM with special networking. On Linux, Docker runs natively with separate network namespaces, which requires fix #1 always. Fixes #2 and #3 are only needed when using a proxy — skip them if the network has direct internet access.

## What this skill does

### 1. Use host networking for the agent container (`docker-compose.yml`)

**Problem:** With Docker bridge networking (the default), the container has its own network namespace. `127.0.0.1` inside the container is the container itself, not the host. This breaks two things: the agent can't reach the host process, and it can't reach a localhost proxy.

On macOS, Docker Desktop's VM has a userspace proxy that bridges traffic transparently.

**Fix:** Switch to `network_mode: host` — the container shares the host's network directly. No port mapping, no `extra_hosts`, and `127.0.0.1` just works:

```yaml
services:
  agent:
    image: minclaw-agent:latest
    network_mode: host
    environment:
      - CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}
      - HOST_URL=http://127.0.0.1:${HOST_PORT:-13821}
      - AGENT_PORT=14827
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
      - GOOGLE_REFRESH_TOKEN=${GOOGLE_REFRESH_TOKEN:-}
      - GH_TOKEN=${GH_TOKEN:-}
      - HTTPS_PROXY=${HTTPS_PROXY:-}
      - HTTP_PROXY=${HTTPS_PROXY:-}
    volumes:
      - ./data/memory:/workspace/memory
```

Key changes from the upstream `docker-compose.yml`:
- Add `network_mode: host` (removes need for `ports` and `extra_hosts`)
- Remove `ports` section (host networking binds directly)
- Remove `extra_hosts` section (`host.docker.internal` not needed)
- Change `HOST_URL` from `http://host.docker.internal:13821` to `http://127.0.0.1:${HOST_PORT:-13821}`
- Add `HTTPS_PROXY` and `HTTP_PROXY` pass-through from `.env` (for proxy users; harmless if empty)

No change needed to `host/src/server.ts` — with host networking, the container shares the host's loopback, so `127.0.0.1` binding works fine.

### 2. Fix Docker builds behind a localhost proxy (`agent/build.sh`) — proxy only

**Problem:** When `DOCKER_BUILD_PROXY` is set (e.g. `http://127.0.0.1:7897`), the proxy address is passed as `http_proxy`/`https_proxy` build-args. But during builds Docker still uses bridge networking by default — `127.0.0.1` refers to the build container, not the host.

**Fix:** Add `--network=host` to both base and agent builds when a proxy is configured:

```bash
# In agent/build.sh, in the DOCKER_BUILD_PROXY block for base builds, add:
BASE_ARGS+=(--network=host)

# Add a similar block for agent builds:
AGENT_ARGS=()
if [[ -n "${DOCKER_BUILD_PROXY}" ]]; then
  AGENT_ARGS+=(--build-arg "https_proxy=${DOCKER_BUILD_PROXY}" --build-arg "http_proxy=${DOCKER_BUILD_PROXY}")
  AGENT_ARGS+=(--network=host)
fi
# Then pass ${AGENT_ARGS[@]} to the agent docker build command
```

### 3. Docker daemon proxy (manual — requires sudo) — proxy only

Docker itself (the daemon) also needs proxy config to pull base images. This can't be automated without sudo. The user must run:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d && printf '[Service]\nEnvironment="HTTP_PROXY=http://127.0.0.1:<port>"\nEnvironment="HTTPS_PROXY=http://127.0.0.1:<port>"\n' | sudo tee /etc/systemd/system/docker.service.d/proxy.conf > /dev/null && sudo systemctl daemon-reload && sudo systemctl restart docker
```

Replace `<port>` with the user's proxy port (e.g. 7897 for Clash).

## How to apply

1. **Always:** Read `docker-compose.yml` and apply the host networking changes described in fix #1.
2. **Proxy only:** Read `agent/build.sh` and add `--network=host` to both the base and agent build commands when `DOCKER_BUILD_PROXY` is set.
3. **Proxy only:** Tell the user to configure the Docker daemon proxy (fix #3) — this requires sudo and must be done manually.
4. After applying, restart services with `pnpm stop && pnpm start`.
