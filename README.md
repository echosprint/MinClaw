# MinClaw

A minimal personal assistant powered by Claude AI. Message it on Telegram to browse the web, run code, schedule tasks, and more.

Inspired by [OpenClaw](https://github.com/openclaw/openclaw) and [NanoClaw](https://github.com/qwibitai/nanoclaw). ~1600 lines of TypeScript for a complete personal assistant — one Telegram channel, one agent container.

## Why I Built MinClaw

Existing projects are impressive but complex. I wanted something small enough to fully understand — no framework magic, no multi-channel adapter layer, no features I didn't build myself.

MinClaw is the smallest thing that actually works:

- One host process (Grammy bot + SQLite + HTTP server + scheduler)
- One agent container (Claude SDK + MCP tools)
- One channel: Telegram

No multi-messenger adapter layer. No per-group isolation system. No plugin architecture. Just the essential wiring between a Telegram message and a Claude response — written plainly so you can read every part.

If you want to understand how the loop works, start here.

## Philosophy

**Small enough to read.** ~1600 lines of source TypeScript (+ ~1000 tests), two processes, 19 files. A complete personal assistant you can read in an afternoon and fully understand.

**Easy to audit.** No transitive magic, no hidden middleware. Every request follows a straight line from Telegram message to Claude response. You can trace the full path in minutes.

**AI-native.** No installation wizard beyond `/setup`. No debugging dashboard — describe the problem to Claude. No config files to manage — change behavior by modifying the code.

**Secure by isolation.** The agent container has no Telegram credentials and only accesses one mounted path: `data/memory/`. It calls back to the host over HTTP. Bash commands run inside the container, not directly on your machine.

## What It Can Do

- **Chat** — full conversation history per chat, persistent memory across sessions
- **Browse the web** — search and fetch pages; headless Chrome via agent-browser; click, fill forms, take screenshots
- **Run code** — Bash, file read/write, grep, glob inside the agent container
- **Schedule tasks** — set recurring or one-time jobs in plain language; MinClaw converts them to cron expressions
- **Gmail** — read and summarize emails, draft and send, reply with threading
- **Google Calendar** — add events in natural language
- **GitHub** — check PR status and CI, create and comment on issues, view workflow run logs, query the API
- **Code & repo work** — clone a repo, analyze architecture, make changes, open PRs via `gh`
- **Persistent memory** — agent workspace survives container restarts at `data/memory/`

## Requirements

- macOS or Linux
- Node.js 22+
- [Claude Code](https://claude.ai/code)
- [Docker](https://www.docker.com) (macOS/Linux)

## Quick Start

```bash
git clone https://github.com/echosprint/MinClaw.git
cd MinClaw
claude
```

Then run `/setup`. Claude Code handles everything: dependencies, environment configuration, Docker image build, and starting the services.

Open Telegram and send your bot a message.

## Usage

Send any message and MinClaw responds. Some examples:

```text
What's on Hacker News today?
Summarise this article: https://...
Write a Python script that counts words in a file
Remind me to take a break every 2 hours
Every weekday at 9 AM, give me a weather summary for Shanghai
What jobs do I have scheduled?
Cancel the break reminder
Show me the open PRs on my repo and check which ones have failing CI
Summarise my unread emails and draft a reply to the one from Alice
Add a calendar event: team meeting tomorrow at 2 PM
Clone https://github.com/owner/repo and explain the architecture
```

### Bot Commands

| Command   | Description                |
|-----------|----------------------------|
| `/chatid` | Show your Telegram chat ID |
| `/ping`   | Test agent connectivity    |
| `/clear`  | Clear conversation history |

## Customizing

MinClaw has no configuration files. To change behavior, modify the code — it's small enough to do safely.

Or just tell Claude Code what you want:

- "Make responses shorter and more direct"
- "Add a `/summarize` command that condenses the last 10 messages"
- "Log every scheduled job to a file"
- "Add a second agent with different tools"

Claude can read the entire codebase in one context window and implement changes accurately.

## Stack

| Layer      | Technology                                |
|------------|-------------------------------------------|
| Host       | Node.js 22+, TypeScript                   |
| Bot        | [Grammy](https://grammy.dev) (Telegram)   |
| Database   | SQLite via better-sqlite3                 |
| Agent      | Docker, Claude Agent SDK (`query()` loop) |
| Tools      | MCP server + agent-browser (Chromium)     |
| Tests      | Vitest, dependency injection              |

## Setup

`/setup` handles this automatically.

## Scheduling

Ask MinClaw from your Telegram to schedule tasks in plain language — it converts them to cron expressions and stores them in SQLite. The scheduler checks for due jobs every 10 seconds.

```text
Remind me to drink water every hour
Every weekday morning at 9 AM, summarize the latest Hacker News posts
In 10 minutes, tell me a joke then stop
```

Manage your jobs:

```text
What jobs do I have scheduled?
Cancel the water reminder
```

## Architecture

```text
Telegram ──► Host (Node.js / macOS or Linux)
               ├─ Grammy bot       — receives messages, sends replies
               ├─ SQLite           — chat history + scheduled jobs
               ├─ HTTP server      — receives callbacks from agent
               └─ Job scheduler    — polls for due jobs every 10 s

                        │  POST /enqueue
                        ▼

              Agent (Docker container / port 14827)
               ├─ Claude SDK       — query() tool-use loop
               ├─ MCP server       — send_message, schedule_job, list_tasks, cancel_task
               ├─ Gmail MCP        — draft/send email, summarize inbox, add calendar events
               ├─ Skills           — github (gh CLI), weather, agent-browser
               └─ Tools            — Bash, Read/Write/Edit, Grep, Glob,
                                     WebSearch, WebFetch, agent-browser (Chromium)
```

The host owns Telegram and the database. The agent owns Claude. They talk over HTTP: the host POSTs tasks to the agent; the agent POSTs replies and job commands back to the host.

The agent container has no Telegram credentials and no write access to the host — all outbound delivery goes through the host.

## Project Structure

```text
MinClaw/
├── host/src/
│   ├── index.ts        — entry point
│   ├── bot.ts          — Grammy Telegram bot
│   ├── server.ts       — HTTP server (agent callbacks)
│   ├── scheduler.ts    — cron job runner
│   ├── db.ts           — SQLite: messages + jobs tables
│   ├── agent.ts        — HTTP client to agent container
│   ├── markdown.ts     — Markdown → Telegram HTML
│   └── log.ts          — colorized stdout + file logger
│
├── agent/src/
│   ├── index.ts           — entry point
│   ├── runner.ts          — Claude @query tool-use loop
│   ├── server.ts          — HTTP server (/health, /enqueue)
│   ├── stream.ts          — async FIFO queue (serialises agent runs)
│   ├── mcp-server.ts      — MCP tool definitions (Telegram + scheduler)
│   ├── mcp-handlers.ts    — MCP tool implementations
│   ├── gmail-mcp-server.ts — Gmail + Calendar MCP tools
│   ├── gmail-handlers.ts  — Gmail + Calendar implementations
│   ├── config.ts          — shared constants (HOST_URL, MCP paths)
│   ├── tz.ts              — fetches host timezone, caches for agent lifetime
│   └── log.ts             — agent logger
│
├── agent/Dockerfile        — production image
├── agent/Dockerfile.base   — base image (Node + Chromium + Claude Code)
├── docker-compose.yml      — agent service definition
├── data/db/                — SQLite database (persisted across restarts)
└── data/memory/            — agent workspace memory (persisted across restarts)
```

## Design Decisions

**Private 1:1 chat only.** MinClaw is a personal assistant, not a group bot. `chatId` is the private conversation ID between you and the bot — history, scheduled jobs, and identity all belong to one person. Group chats are out of scope: the bot would respond to every message, all members would share one history, and sender identity is never stored. Supporting groups would require per-user `chatId`, explicit `@mention` filtering, and sender attribution throughout.

**Sequential agent runs.** Messages are queued and processed one at a time. Only one Claude session is active at any moment. This keeps the system simple and avoids race conditions on shared state (history, jobs). A message sent while the agent is busy waits in the queue.

**Fire-and-forget from host to agent.** The host POSTs to `/enqueue` and immediately gets a `202` — it does not wait for Claude to finish. The agent replies asynchronously via `POST /send` back to the host. This keeps the host responsive and decouples Telegram's webhook timeout from Claude's processing time.

**MCP server spawned fresh per run.** Each agent run starts a new MCP subprocess with `CHAT_ID` injected via environment variable. There is no persistent MCP daemon. This keeps the MCP server stateless and scoped to exactly one conversation.

**Agent has no Telegram credentials.** The agent container cannot send messages directly to Telegram — it must call `send_message` (MCP tool) → host `/send` → Grammy. This means all outbound delivery is auditable through one path and the agent cannot act outside the host's control.

**Text messages only.** Photos, stickers, voice messages, and other media types are silently ignored. The agent receives plain text and responds in Markdown.

**Agent runs in Docker, not on the host machine.** This is a deliberate security trade-off. The agent has access to powerful tools — it can run arbitrary Bash commands, read and write files, and modify environment variables. Running it directly on the host (as OpenClaw does) means those capabilities apply to your actual machine: your SSH keys, your dotfiles, your credentials. A sufficiently clever prompt injection in a fetched web page or email could do real damage. Docker doesn't make the agent safe, but it contains the blast radius. Bash commands run inside the container, not on your machine. The worst case is a corrupted container, not a compromised host. Security matters more here than the convenience of direct host access.

## How It Works

When you send a message:

1. Grammy bot receives it and saves it to SQLite
2. Host POSTs a `RunPayload` (message + history) to the agent at `POST /enqueue`
3. Agent runs a Claude tool-use loop with all tools available
4. Claude calls `send_message` (MCP tool) to reply
5. Host receives the callback at `POST /send` and delivers it via Grammy

Scheduled jobs follow the same path — the scheduler POSTs the job's task to the agent as a user message, and the agent handles it like any other conversation turn.

## Contributing

MinClaw only supports Telegram and has no plans to add other messaging platforms. The host is intentionally minimal — one bot, one database, one scheduler.

**Don't add platforms. Add skills.**

If you want to extend what the agent can do, contribute a skill file under `agent/.claude/skills/`. A skill is a Markdown file that teaches Claude Code how to wire up a new capability — a new MCP tool, a new API integration, a new workflow.

```text
agent/.claude/skills/
└── your-skill-name/
    └── SKILL.md    — instructions Claude Code follows to add the capability
```

The agent picks up skills automatically — no manual invocation needed.

## License

MIT
