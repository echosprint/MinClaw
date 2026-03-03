---
name: apply-proxy
description: Configure HTTP proxy for MinClaw (host, Docker build, container runtime, Docker daemon). Use when behind a proxy (Clash, V2Ray, Surge) or when Telegram/npm/apt-get can't connect. Triggers on "apply proxy", "proxy setup", "proxy config", "can't reach telegram", "connection timeout".
---

# Apply Proxy Configuration

Common ports: Clash `7890`, V2Ray `10809`, Surge `6152`.

## Diagnostic

```bash
echo "=== Proxy Diagnostic ==="

echo -e "\n1. Shell env proxy?"
PROXY="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}"
echo "  → ${PROXY:-(none detected)}"

echo -e "\n2. .env has HTTPS_PROXY?"
[ -f .env ] && grep "HTTPS_PROXY" .env || echo "NO"

echo -e "\n3. Telegram reachable (direct)?"
curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 5 https://api.telegram.org || echo "BLOCKED"

echo -e "\n4. Telegram reachable (via proxy)?"
if [ -n "$PROXY" ]; then
  curl -x "$PROXY" -s -o /dev/null -w "HTTP %{http_code}" --max-time 5 https://api.telegram.org || echo "UNREACHABLE"
else
  echo "(skipped)"
fi
```

Use the detected proxy URL. If none detected, ask the user for their proxy port.

## Step 1: Set `HTTPS_PROXY` in `.env`

```bash
HTTPS_PROXY=http://127.0.0.1:<port>
```

## Step 2: Merge

Saves originals to `bases/` (first time only), then three-way merges — user edits outside the patched regions are preserved.

```bash
SKILL=.claude/skills/apply-proxy

for f in agent/build.sh docker-compose.yml; do
  [ -f "bases/$f" ] || { mkdir -p "bases/$(dirname "$f")"; cp "$f" "bases/$f"; }
done

git merge-file agent/build.sh     bases/agent/build.sh     "$SKILL/files/build.sh"
git merge-file docker-compose.yml bases/docker-compose.yml "$SKILL/files/docker-compose.yml"
```

If exit code is non-zero, conflict markers (`<<<<<<<`) were inserted — resolve before continuing.

| File                 | What changes                                                |
|----------------------|-------------------------------------------------------------|
| `agent/build.sh`     | Auto-detect `HTTPS_PROXY` from env, pass to Docker builds   |
| `docker-compose.yml` | Pass `HTTPS_PROXY` / `HTTP_PROXY` into the container         |

## Step 3: Docker daemon proxy (Linux only)

Tell the user to run:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
printf '[Service]\nEnvironment="HTTP_PROXY=http://127.0.0.1:<port>"\nEnvironment="HTTPS_PROXY=http://127.0.0.1:<port>"\n' \
  | sudo tee /etc/systemd/system/docker.service.d/proxy.conf > /dev/null
sudo systemctl daemon-reload && sudo systemctl restart docker
```

On macOS, use Docker Desktop Preferences → Resources → Proxies instead.

## Step 4: Restart

```bash
pnpm stop && pnpm start
```
