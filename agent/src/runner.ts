import { query, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./log.js";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface RunPayload {
  chatId: string;
  message: string;
  history: Message[];
  timestamp: string;
}

const HOST_URL = process.env.HOST_URL ?? "http://host.docker.internal:13821";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpServerPath = path.resolve(__dirname, "..", "dist", "mcp-server.js");
const clauDir = path.join(__dirname, "..", ".claude");

const ALLOWED_TOOLS = [
  // Core tools
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "ToolSearch",
  "Skill",
  "NotebookEdit",
  // MinClaw MCP tools
  "mcp__minclaw__send_message",
  "mcp__minclaw__schedule_job",
  "mcp__minclaw__list_tasks",
  "mcp__minclaw__cancel_task",
  "mcp__minclaw__get_local_time",
];

const TZ = await fetch(`${HOST_URL}/timezone`)
  .then((r) => r.json() as Promise<{ timezone: string }>)
  .then((d) => d.timezone)
  .catch((err) => {
    log.error(`timezone fetch failed: ${err}`);
    return "UTC";
  });

const options = {
  cwd: "/workspace",
  plugins: [
    { type: "local" as const, path: path.join(clauDir, "skills", "agent-browser") },
    { type: "local" as const, path: path.join(clauDir, "skills", "weather") },
  ],
  allowedTools: ALLOWED_TOOLS,
  permissionMode: "bypassPermissions" as const,
  allowDangerouslySkipPermissions: true,
  settingSources: ["project", "user"] as SettingSource[],
};

class MessageStream {
  private queue: RunPayload[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(payload: RunPayload): void {
    this.queue.push(payload);
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<RunPayload> {
    while (true) {
      while (this.queue.length > 0) yield this.queue.shift()!;
      if (this.done) return;
      await new Promise<void>((r) => {
        this.waiting = r;
      });
      this.waiting = null;
    }
  }
}

const globalStream = new MessageStream();

async function drainMessages(): Promise<never> {
  for await (const p of globalStream) {
    await runQuery(p).catch((err) => log.error(`runQuery error chatId=${p.chatId}: ${err}`));
  }
  log.error("globalStream ended unexpectedly");
  process.exit(1);
}

// Start the drain loop: runs for the lifetime of the process, processing
// one message at a time. enqueue() feeds payloads in; errors per-message
// are logged and skipped so the loop never stops.
void drainMessages();

export function enqueue(payload: RunPayload): void {
  globalStream.push(payload);
}

async function runQuery(payload: RunPayload): Promise<void> {
  const context = payload.history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const prompt = context ? `${context}\n\nUser: ${payload.message}` : payload.message;

  log.info(`run start  chatId=${payload.chatId}`);

  const mcpServers = {
    minclaw: {
      command: "node",
      args: [mcpServerPath],
      env: { CHAT_ID: payload.chatId, HOST_URL, TZ },
    },
  };

  for await (const msg of query({ prompt, options: { ...options, mcpServers } })) {
    const m = msg as Record<string, unknown>;
    if (m.type === "assistant") {
      const content = (m.message as Record<string, unknown>)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "text") {
            log.info(`agent text  "${String(b.text).slice(0, 500)}"`);
          } else if (b.type === "tool_use") {
            log.info(`tool use    ${b.name}`);
          }
        }
      }
    } else if (m.type === "result") {
      log.info(`run result  subtype=${m.subtype}`);
    }
  }

  log.info(`run done   chatId=${payload.chatId}`);
}
