---
name: debug
description: Debug MinClaw agent issues. Use when things aren't working, the bot doesn't reply, the container fails, authentication errors, MCP tool failures, or to understand how the system works. Covers logs, environment variables, mounts, and common issues.
---

# MinClaw Debugging

## Architecture Overview

```text
Host (macOS/Linux)                     Container (Linux)
──────────────────────────────────────────────────────────
host/src/agent.ts                      agent/src/
  │                                      │
  │  POST /enqueue (chatId, message,     │  runner.ts — Claude Agent SDK loop
  │  history) ─────────────────────────> │    │
  │                                      │    ├── MCP server (mcp-server.ts)
  │  <── mcp__minclaw__send_message ─────│    │   POST HOST_URL/send
  │  <── mcp__minclaw__schedule_job ─────│    │   POST HOST_URL/schedule
  │                                      │
  └── ./data/memory ──────────────> /workspace/memory

Host HTTP :13821   ←──────────────────  Agent HTTP :14827
```

**Key points:**

- The agent container calls back to the host via `http://host.docker.internal:13821`
- The MCP server runs as a subprocess inside the container, spawned by the Claude Agent SDK
- `log/minclaw.log` is shared: both agent (`[agt]` prefix) and host (`[bot]` prefix) append to it
- `data/memory/` persists agent memory across runs

## Log Locations

| Log                    | Location            | Content                                                           |
|------------------------|---------------------|-------------------------------------------------------------------|
| **Agent** `[agt]`      | `log/minclaw.log`   | Run start/done, tool calls, send_message, errors (from container) |
| **Host** `[bot]`       | `log/minclaw.log`   | Bot polling, scheduler ticks, `/send` and `/schedule` calls       |

Both processes append to the same file. Watch in real time:

```bash
tail -f log/minclaw.log
```

Filter by source:

```bash
# Agent only
grep '\[agt\]' log/minclaw.log | tail -20

# Host only
grep '\[bot\]' log/minclaw.log | tail -20
```

## Quick Diagnostic

Run this from the repo root to check the most common issues at a glance:

```bash
echo "=== MinClaw Diagnostics ==="

echo -e "\n1. Authentication configured?"
[ -f .env ] && \
  (grep -q "CLAUDE_CODE_OAUTH_TOKEN=." .env || grep -q "ANTHROPIC_API_KEY=." .env) \
  && echo "OK" || echo "MISSING — add CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY to .env"

echo -e "\n2. Telegram bot token set?"
[ -f .env ] && grep -q "TELEGRAM_BOT_TOKEN=." .env && echo "OK" || echo "MISSING"

echo -e "\n3. Docker running?"
docker info &>/dev/null && echo "OK" || echo "NOT RUNNING — start Docker"

echo -e "\n4. Agent image exists?"
docker image inspect minclaw-agent:latest &>/dev/null && echo "OK" || echo "MISSING — run: cd agent && bash build.sh"

echo -e "\n5. Agent container running?"
docker ps --filter name=minclaw --format "{{.Names}} {{.Status}}" | grep -q minclaw \
  && docker ps --filter name=minclaw --format "{{.Names}} {{.Status}}" \
  || echo "NOT RUNNING — run: pnpm start"

echo -e "\n6. Host listening on :13821?"
lsof -i :13821 | grep -q LISTEN && echo "OK" || echo "NOT RUNNING"

echo -e "\n7. Agent container port bound on :14827?"
lsof -i :14827 | grep -q LISTEN && echo "OK" || echo "UNREACHABLE"

echo -e "\n8. Recent agent activity?"
tail -5 log/minclaw.log 2>/dev/null || echo "(no agent log yet)"
```

## Common Issues

### 0. Bot receives messages but ignores them (allowlist)

The bot silently drops messages from users not listed in `TELEGRAM_ALLOWED_IDS`. Each blocked message is logged:

```bash
grep "bot blocked" log/minclaw.log | tail -20
```

Example log line:

```text
bot blocked  userId=123456789 name="John Doe" username=@johndoe text="hello"
```

The `userId` field is exactly what goes in `TELEGRAM_ALLOWED_IDS`. To allow a user:

```bash
echo "123456789" >> TELEGRAM_ALLOWED_IDS
pnpm stop && pnpm start
```

If the file is missing entirely, create it:

```bash
touch TELEGRAM_ALLOWED_IDS
```

**One user works but another doesn't?** This is an allowlist issue. Ask the other user to send a message to the bot, then check the logs for their blocked entry:

```bash
grep "bot blocked" log/minclaw.log | tail -5
```

Extract their `userId` from the log line, add it to the allowlist, and restart:

```bash
echo "<their-userId>" >> TELEGRAM_ALLOWED_IDS
pnpm stop && pnpm start
```

---

### 1. Bot receives messages but agent never replies

The agent container is the most likely culprit.

**Check container is running:**

```bash
docker ps --filter name=minclaw
```

If not running, start it:

```bash
pnpm start
```

**Check agent log for errors:**

```bash
tail -50 log/minclaw.log
```

**Verify host can reach agent:**

```bash
curl -s http://localhost:14827/health
```

**Verify agent can reach host (from inside container):**

```bash
docker exec $(docker ps -qf name=minclaw) \
  curl -s http://host.docker.internal:13821/health || echo "unreachable"
```

If unreachable on Linux, check `docker-compose.yml` has `extra_hosts: host.docker.internal:host-gateway` — requires Docker 20.10+.

---

### 2. "Claude Code process exited with code 1"

Seen in `log/minclaw.log` as `run result  subtype=error_during_run` or a crash.

**Check the Claude credential:**

```bash
grep -E "CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY" .env
```

Validate the credential works:

```bash
source .env
docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN}" \
  -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  minclaw-agent:latest \
  node -e "
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    (async () => {
      for await (const m of query({ prompt: 'Say hi', options: { allowedTools: [], allowDangerouslySkipPermissions: true } }))
        console.log(m.type);
    })().catch(e => { console.error(e.message); process.exit(1); });
  "
```

If it fails, the token is invalid or expired. Re-run setup Phase 2c.

**Check the container runs as non-root:**

`--dangerously-skip-permissions` fails when running as root. Verify:

```bash
docker run --rm minclaw-agent:latest whoami
# Must print: node
```

---

### 3. MCP tool failures (send_message / schedule_job not working)

The MCP server runs as a subprocess inside the container and calls back to the host.

**Verify MCP server binary exists in the image:**

```bash
docker run --rm minclaw-agent:latest ls /app/dist/mcp-server.js
```

If missing, the agent image needs a rebuild:

```bash
cd agent && bash build.sh
```

**Test send_message manually from inside the container:**

```bash
source .env
docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN}" \
  --add-host host.docker.internal:host-gateway \
  minclaw-agent:latest \
  node -e "
    fetch('http://host.docker.internal:13821/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: 'test', text: 'ping from debug' })
    }).then(r => console.log('status:', r.status)).catch(e => console.error(e.message))
  "
```

Status `200` means the host received it. If it fails, check that the host is running and `HOST_URL` is correct.

---

### 4. Environment variables not reaching the container

The container gets its Claude credential from `docker-compose.yml` `environment:` block, sourced from `.env`. Check:

```bash
# Confirm docker compose picks up the values
docker compose config | grep -A5 environment
```

**Verify inside the container:**

```bash
docker exec $(docker ps -qf name=minclaw) \
  node -e "console.log('OAuth:', (process.env.CLAUDE_CODE_OAUTH_TOKEN||'').length, 'chars')"
```

If `0 chars`, the `.env` value is missing or the container wasn't restarted after editing `.env`. Restart:

```bash
pnpm stop && pnpm start
```

---

### 5. Memory not persisting across runs

Agent memory lives at `data/memory/` (host) → `/workspace/memory` (container).

**Check the mount:**

```bash
docker inspect $(docker ps -qf name=minclaw) \
  --format '{{range .Mounts}}{{.Source}} → {{.Destination}}{{println}}{{end}}'
```

Expected lines:

```text
.../data/memory → /workspace/memory
```

**Check memory files from host:**

```bash
ls -la data/memory/
```

---

### 6. Bot can't reach Telegram (GFW / China network)

**Symptom:** The host starts, the bot token is valid, but messages are never received and no polling activity appears in the log. Or the host crashes with a connection timeout on startup.

This is a proxy issue. Run the `/apply-proxy` skill — it covers host proxy, Docker build proxy, container runtime, and Docker daemon configuration with diagnostics.

---

### 7. Bot token rejected

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

Must return `"ok":true`. If not, re-check `TELEGRAM_BOT_TOKEN` in `.env` — no extra spaces or newlines. Re-run setup Phase 2a to get a new token.

---

### 8. Bot responds in DMs but not in groups

Group Privacy is enabled — the bot only sees @mentions and commands in groups. Fix:

`@BotFather` → `/mybots` → select bot → **Bot Settings** → **Group Privacy** → **Turn off**

Then remove and re-add the bot to the group.

---

### 9. SQLite error on startup

```bash
rm -f data/db/minclaw.db && pnpm start
```

The schema is auto-created by `db.init()` on next start. No data loss beyond message history.

---

### 10. Scheduler jobs not firing

Jobs are stored in `data/db/minclaw.db` and run by the host scheduler.

**Inspect jobs:**

```bash
sqlite3 data/db/minclaw.db "SELECT id, chat_id, cron, task, one_shot, active, datetime(next_run/1000,'unixepoch') as next_run FROM jobs"
```

**Check scheduler-triggered runs** in `log/minclaw.log` — look for `[agent][INFO] run start` entries that appear without a preceding `[bot][INFO] bot recv` (those are scheduler-fired, not user messages).

**Force a tick** (development only — restart the host process):

```bash
pnpm stop && pnpm start
```

**Clear all jobs:**

```bash
pnpm clear-jobs
```

---

## Manual Container Testing

### Interactive shell

```bash
docker run --rm -it --entrypoint /bin/bash minclaw-agent:latest
```

### Test a full agent run manually

```bash
curl -s -X POST http://localhost:14827/enqueue \
  -H "Content-Type: application/json" \
  -d '{"chatId":"debug-test","message":"Say hello","history":[],"timestamp":"2024-01-01T00:00:00.000Z"}'
# Returns 202 immediately; watch log/minclaw.log for the result
tail -f log/minclaw.log
```

### Inspect image contents

```bash
docker run --rm minclaw-agent:latest node -e "
  const { execSync } = require('child_process');
  console.log('Node:', process.version);
  console.log('claude:', execSync('claude --version 2>&1').toString().trim());
  console.log('dist:', require('fs').readdirSync('/app/dist').join(', '));
"
```

---

## SDK Options Reference

`runner.ts` uses these options for every run:

```typescript
query({
  prompt,               // history + latest message formatted as plain text
  options: {
    cwd: '/workspace',
    plugins: [
      { type: 'local', path: '.claude/skills/agent-browser' },
      { type: 'local', path: '.claude/skills/weather' },
      { type: 'local', path: '.claude/skills/github' },
      { type: 'local', path: '.claude/skills/news' },
    ],
    allowedTools: [
      // Core tools
      'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
      'WebSearch', 'WebFetch',
      'Task', 'TaskOutput', 'TaskStop',
      'TodoWrite', 'ToolSearch', 'Skill', 'NotebookEdit',
      // MinClaw MCP tools
      'mcp__minclaw__send_message', 'mcp__minclaw__schedule_job',
      'mcp__minclaw__list_tasks', 'mcp__minclaw__cancel_task',
      'mcp__minclaw__get_local_time', 'mcp__minclaw__get_chat_history',
    ],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,   // required with bypassPermissions
    settingSources: ['project', 'user'],
    mcpServers: {
      minclaw: {
        command: 'node',
        args: ['/app/dist/mcp-server.js'],
        env: { CHAT_ID: payload.chatId, HOST_URL, TZ },
      },
    },
  },
})
```

**`allowDangerouslySkipPermissions: true` is required.** Without it, Claude Code exits with code 1 when `permissionMode` is `bypassPermissions`.

---

## Rebuilding After Changes

```bash
# Rebuild agent image only (fast — reuses base)
cd agent && bash build.sh

# Full stop → rebuild → start
pnpm reboot

# Force clean rebuild (clears Docker layer cache)
docker builder prune -f
cd agent && bash build.sh
```

## Docker Build Network Failures (apt-get / npm)

`apt-get` or `npm install` during `docker build` can fail with network errors — connection timeouts, `Could not resolve`, `Failed to fetch`. This is almost always a transient network issue, not a code problem. **Just retry:**

```bash
cd agent && bash build.sh --base   # or: pnpm build:fresh
```

If it keeps failing after 2–3 tries, clear stale cache and retry:

```bash
docker builder prune -f
pnpm build:fresh
```

For mirror configuration (Debian apt, npm registry), use the `/apply-mirror` skill. For proxy configuration, use the `/apply-proxy` skill.

---

## Checking the Base Image

The base image (`minclaw-agent-base`) is slow to build and rarely needs rebuilding. Rebuild only when:

- System dependencies in `Dockerfile.base` change
- Chromium or global npm packages need updating

```bash
cd agent && bash build.sh --base
```
