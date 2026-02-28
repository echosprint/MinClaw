# MinClaw

A minimal personal assistant powered by Claude AI. Message it on Telegram to browse the web, run code, schedule tasks, and more.

Inspired by [OpenClaw](https://github.com/openclaw/openclaw) and [NanoClaw](https://github.com/qwibitai/nanoclaw). Under 1000 lines of code for a complete personal assistant — one Telegram channel, one agent container.

## Why I Built MinClaw

Existing projects are impressive but complex. I wanted something small enough to fully understand — no framework magic, no multi-channel adapter layer, no features I didn't build myself.

MinClaw is the smallest thing that actually works:

- One host process (Grammy bot + SQLite + HTTP server + scheduler)
- One agent container (Claude SDK + MCP tools)
- One channel: Telegram

No multi-messenger adapter layer. No per-group isolation system. No plugin architecture. Just the essential wiring between a Telegram message and a Claude response — written plainly so you can read every part.

If you want to understand how the loop works, start here.

## Philosophy

**Small enough to read.** Under 1000 lines of TypeScript, two processes, 12 files. A complete personal assistant you can read in an afternoon and fully understand.

**Easy to audit.** No transitive magic, no hidden middleware. Every request follows a straight line from Telegram message to Claude response. You can trace the full path in minutes.

**AI-native.** No installation wizard beyond `/setup`. No debugging dashboard — describe the problem to Claude. No config files to manage — change behavior by modifying the code.

**Secure by isolation.** The agent container has no Telegram credentials and only accesses two mounted paths: `data/memory/` and `log/`. It calls back to the host over HTTP. Bash commands run inside the container, not directly on your machine.

## What It Can Do

- **Chat** — talk to MinClaw from your Telegram; full conversation history per chat
- **Browse the web** — search and fetch pages; headless Chrome via agent-browser
- **Run code** — Bash, file read/write, grep, glob inside the agent container
- **Schedule tasks** — set recurring or one-time jobs in plain language; MinClaw converts them to cron expressions
- **Persistent memory** — agent workspace survives container restarts at `data/memory/`

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
| Host       | Node.js 20+, TypeScript                   |
| Bot        | [Grammy](https://grammy.dev) (Telegram)   |
| Database   | SQLite via better-sqlite3                 |
| Agent      | Docker, Claude Agent SDK (`@query` loop)  |
| Tools      | MCP server + agent-browser (Chromium)     |
| Tests      | Vitest, dependency injection              |

## Setup

`/setup` handles this automatically.

## Scheduling

Ask MinClaw from your Telegram to schedule tasks in plain language — it converts them to cron expressions and stores them in SQLite. The scheduler checks for due jobs every 60 seconds.

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
               └─ Job scheduler    — polls for due jobs every 60 s

                        │  POST /run
                        ▼

              Agent (Docker container / port 14827)
               ├─ Claude SDK       — @query tool-use loop
               ├─ MCP server       — send_message, schedule_job, list_tasks, cancel_task
               └─ Tools            — Bash, Read/Write/Edit, Grep, Glob,
                                     WebSearch, WebFetch, agent-browser
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
│   └── markdown.ts     — Markdown → Telegram HTML
│
├── agent/src/
│   ├── index.ts        — entry point
│   ├── runner.ts       — Claude @query tool-use loop
│   ├── server.ts       — HTTP server (/health, /run)
│   ├── mcp-server.ts   — MCP tool definitions
│   └── mcp-handlers.ts — MCP tool implementations
│
├── agent/Dockerfile        — production image
├── agent/Dockerfile.base   — base image (Node + Chromium + Claude Code)
├── docker-compose.yml      — agent service definition
├── data/db/                — SQLite database (persisted across restarts)
└── data/memory/            — agent workspace memory (persisted across restarts)
```

## How It Works

When you send a message:

1. Grammy bot receives it and saves it to SQLite
2. Host POSTs a `RunPayload` (message + history) to the agent at `POST /run`
3. Agent runs a Claude tool-use loop with all tools available
4. Claude calls `send_message` (MCP tool) to reply
5. Host receives the callback at `POST /send` and delivers it via Grammy

Scheduled jobs follow the same path — the scheduler POSTs the job's task to the agent as a user message, and the agent handles it like any other conversation turn.

## License

MIT
