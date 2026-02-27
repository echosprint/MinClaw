---
name: setup
description: Run initial MinClaw setup. Use when the user wants to install dependencies, configure environment, build the agent Docker image, or start the services. Triggers on "setup", "install", "configure minclaw", or first-time setup requests.
---

# MinClaw Setup

Run setup steps automatically. Only pause when user action is required (obtaining a Telegram bot token, pasting API credentials). When something is broken, fix it — don't tell the user to fix it themselves unless it genuinely requires their manual action.

**Project layout:**

- `host/` — Node.js Telegram bot + HTTP server + SQLite scheduler (runs on host)
- `agent/` — Claude Code agent in Docker container (receives `/run` requests from host)
- `.env` — secrets loaded by both `docker compose` and `pnpm dev:host`
- `docker-compose.yml` — runs the agent container
- `agent/build.sh` — builds `minclaw-agent-base` (slow, once) then `minclaw-agent` (fast, per change)

**Key ports:**

- Host HTTP server: `13821` (env: `HOST_PORT`)
- Agent container: `14827` (env: `AGENT_PORT`)

---

## Phase 0: Pre-flight

Before running any steps, do a quick state check so you only redo what's actually needed.

```bash
node --version 2>/dev/null || echo "NODE_MISSING"
pnpm --version 2>/dev/null || echo "PNPM_MISSING"
test -f .env && echo "ENV_EXISTS" || echo "ENV_MISSING"
docker info > /dev/null 2>&1 && echo "DOCKER_RUNNING" || echo "DOCKER_DOWN"
docker image inspect minclaw-agent-base:latest > /dev/null 2>&1 && echo "BASE_EXISTS" || echo "BASE_MISSING"
docker image inspect minclaw-agent:latest > /dev/null 2>&1 && echo "AGENT_EXISTS" || echo "AGENT_MISSING"
docker ps --filter name=minclaw --format "{{.Names}}" | grep -q minclaw && echo "CONTAINER_RUNNING" || echo "CONTAINER_DOWN"
lsof -i :13821 | grep -q LISTEN && echo "HOST_RUNNING" || echo "HOST_DOWN"
```

Use the results to skip steps that are already complete. Summarise what will be done before starting.

---

## Phase 1: Bootstrap — Node.js + pnpm + Dependencies

Check Node.js and pnpm are available:

```bash
node --version && pnpm --version
```

- **Node.js missing or < 22:** `AskUserQuestion: Install Node.js 22?`
  - macOS: `brew install node@22` or `nvm install 22`
  - Linux: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`
- **pnpm missing:** `npm install -g pnpm`

Install workspace dependencies:

```bash
pnpm install
```

If `better-sqlite3` fails to load (native module error):

- macOS: `xcode-select --install`, then `pnpm rebuild better-sqlite3`
- Linux: `sudo apt-get install -y build-essential python3`, then `pnpm rebuild better-sqlite3`

Verify tests pass:

```bash
pnpm test
```

All tests must pass before continuing.

---

## Phase 2: Environment File

Check whether `.env` exists:

```bash
test -f .env && echo "EXISTS" || echo "MISSING"
```

If **MISSING**, create it from the required keys (ask user for values — do NOT invent them):

```text
TELEGRAM_BOT_TOKEN=
CLAUDE_CODE_OAUTH_TOKEN=
AGENT_URL=http://localhost:14827
HOST_PORT=13821
```

### 2a. Telegram Bot Token

If `TELEGRAM_BOT_TOKEN` is empty or missing, tell the user:

> I need you to create a Telegram bot:
>
> 1. Open Telegram and search for `@BotFather`
> 2. Send `/newbot` and follow the prompts:
>    - **Name:** Something friendly (e.g., "Andy Assistant")
>    - **Username:** Must end with `bot` (e.g., `andy_ai_bot`)
> 3. Copy the token BotFather gives you — it looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`

Use `AskUserQuestion` to collect the token, then write it to `.env`.

Validate the token is accepted by Telegram:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

The response must contain `"ok":true`. If not, the token is wrong — collect it again.

### 2b. Group Privacy (for group chats)

If the user plans to use the bot in a Telegram group, tell them:

> **Important for group chats**: By default Telegram bots only see @mentions and commands in groups. To let Andy see all messages:
>
> 1. In Telegram, open `@BotFather`
> 2. Send `/mybots` and select your bot
> 3. Go to **Bot Settings** → **Group Privacy** → **Turn off**
>
> You'll also need to remove and re-add the bot to any existing groups for the change to take effect.

This is optional if the user only wants trigger-based responses.

### 2c. Claude Credential

If `CLAUDE_CODE_OAUTH_TOKEN` (and `ANTHROPIC_API_KEY`) are both empty or missing:

`AskUserQuestion: Claude Pro/Max subscription or Anthropic API key?`

- **Subscription:** Tell the user to run `claude setup-token` in another terminal, copy the token, then use `AskUserQuestion` to collect it. Write as `CLAUDE_CODE_OAUTH_TOKEN=<token>` in `.env`.
- **API key:** Use `AskUserQuestion` to collect the key. Write as `ANTHROPIC_API_KEY=<key>` in `.env`.

### 2d. Optional Proxy

`AskUserQuestion: Do you use an HTTP proxy? (e.g. Clash, Surge)`

If yes, collect the proxy URL and add:

```text
HTTPS_PROXY=http://127.0.0.1:<port>
DOCKER_BUILD_PROXY=http://host.docker.internal:<port>
```

---

## Phase 3: Docker

Check Docker availability:

```bash
docker info > /dev/null 2>&1 && echo "RUNNING" || echo "NOT_RUNNING"
```

- **RUNNING:** continue
- **NOT_RUNNING (installed):**
  - macOS: `open -a Docker`, wait 15 s, re-check
  - Linux: `sudo systemctl start docker`, re-check
- **NOT_RUNNING (not found):** `AskUserQuestion: Docker is required for the agent container. Install it?`
  - macOS: `brew install --cask docker`, then `open -a Docker` and wait
  - Linux: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER` (user may need to re-login)

If `DOCKER_BUILD_PROXY` is set in `.env`, pass it through during builds with `--build-arg https_proxy=...`.

---

## Phase 4: Build Agent Docker Image

### 4a. Base image (slow, run once)

Check if the base image already exists:

```bash
docker image inspect minclaw-agent-base:latest > /dev/null 2>&1 && echo "EXISTS" || echo "MISSING"
```

If **MISSING**, build it (takes several minutes — Chromium is large):

```bash
cd agent && bash build.sh --base
```

If the build needs a proxy:

```bash
cd agent && docker build \
  --build-arg https_proxy="${DOCKER_BUILD_PROXY}" \
  --build-arg http_proxy="${DOCKER_BUILD_PROXY}" \
  -f Dockerfile.base -t minclaw-agent-base:latest .
```

### 4b. Agent image (fast, rebuild on code changes)

```bash
cd agent && bash build.sh
```

If **BUILD FAILS:**

- Read the Docker build output for the root cause.
- Stale cache: `docker builder prune -f`, then retry.
- Missing npm packages: check `agent/package.json`, run `pnpm install` in `agent/`, retry.
- Proxy error: ensure `DOCKER_BUILD_PROXY` is set correctly in `.env`.

Confirm the image exists:

```bash
docker image inspect minclaw-agent:latest > /dev/null 2>&1 && echo "OK" || echo "MISSING"
```

---

## Phase 5: Create Required Directories

```bash
mkdir -p log data/db data/memory
```

- `log/` — shared log volume mounted into the agent container
- `data/db/` — SQLite database (`minclaw.db`) lives here, auto-created by host on first run
- `data/memory/` — agent's persistent memory, also mounted into the container

---

## Phase 6: Start Services

```bash
pnpm start
```

This runs `docker compose up -d` (agent container, background) then `pnpm dev:host` (host process, **foreground — keep the terminal open**). The host logs appear directly in this terminal.

**If `docker compose up -d` fails:**

- Image not found: re-run Phase 4b.
- Port conflict on `14827`: `lsof -ti :14827 | xargs kill -9`, retry.
- Docker socket permission denied: `sudo chmod 666 /var/run/docker.sock` (Linux), or add user to docker group.

**If `pnpm dev:host` fails:**

- Missing `.env` key: re-check Phase 2.
- Port conflict on `13821`: `lsof -ti :13821 | xargs kill -9`, retry.
- `TELEGRAM_BOT_TOKEN` invalid: re-validate with `curl` as shown in Phase 2a.

---

## Phase 7: Verify

### 7a. Infrastructure checks

Check the agent container is running:

```bash
docker ps --filter name=minclaw --format "{{.Names}} {{.Status}}"
```

Check host process is listening:

```bash
lsof -i :13821 | grep LISTEN
```

Check agent container port is bound on host:

```bash
lsof -i :14827 | grep LISTEN
```

Tail logs to confirm no startup errors:

```bash
tail -n 30 log/minclaw.log 2>/dev/null || echo "(no agent log yet)"
```

### 7b. End-to-end test

Tell the user:

> **Test it now:**
>
> 1. Open Telegram and search for your bot by username
> 2. Press **Start** (if first time)
> 3. Send any message — Andy should reply within a few seconds
>
> If it works, setup is complete. Watch live logs with:
>
> ```bash
> tail -f log/minclaw.log
> ```

If the bot does not respond within 10 seconds, check logs before concluding success.

---

## Ongoing Use

**Stop everything:**

```bash
pnpm stop
```

**Rebuild agent after code changes:**

```bash
pnpm reload
```

This runs: `pnpm stop` → `agent/build.sh` → `docker compose up -d` → `pnpm dev:host`.

**Clear all scheduled jobs:**

```bash
pnpm clear-jobs
```

**Check scheduled jobs in the database:**

```bash
sqlite3 data/db/minclaw.db "SELECT id, chat_id, cron, task, active FROM jobs"
```

---

## Reset / Clean Slate

To start completely fresh:

```bash
pnpm stop
docker rmi minclaw-agent:latest 2>/dev/null
rm -f data/db/minclaw.db
```

To also rebuild the base image (e.g. after system dependency changes):

```bash
docker rmi minclaw-agent-base:latest 2>/dev/null
cd agent && bash build.sh --base && bash build.sh
```

To wipe agent memory:

```bash
rm -rf data/memory/*
```

---

## Troubleshooting

**Bot token rejected:** Validate with `curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"`. Must return `"ok":true`. If not, re-check the token in `.env` — no extra spaces or newlines.

**Bot doesn't respond to messages:** Check host logs for `[bot] polling started`. Ensure no other process is polling the same token (e.g. another MinClaw instance). Only one process can poll a bot token at a time.

**Bot responds in DMs but not in groups:** Group Privacy is enabled. Fix: `@BotFather` → `/mybots` → select bot → **Bot Settings** → **Group Privacy** → **Turn off**, then remove and re-add the bot to the group.

**Agent not replying (bot receives but agent is silent):** Check `docker ps` — container must be running. Check `log/minclaw.log` for errors. Verify `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is valid in `.env`. Check that `AGENT_URL=http://localhost:14827` is set in `.env` (the code defaults to this value, but setting it explicitly makes it clear).

**"Claude Code process exited with code 1":** The Claude credential in `.env` is invalid or expired. Re-run Phase 2c.

**Container can't reach host (`host.docker.internal` fails on Linux):** The `docker-compose.yml` includes `extra_hosts: host.docker.internal:host-gateway` — this requires Docker 20.10+. Check `docker --version`.

**SQLite error on startup:** Delete `data/db/minclaw.db` and restart — the schema is auto-created by `db.init()` on next start.

**Proxy issues:** If builds hang, ensure both `HTTPS_PROXY` and `DOCKER_BUILD_PROXY` are set in `.env`. The host process picks up `HTTPS_PROXY` automatically; Docker builds need `--build-arg`.
