import { query, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import { log } from "./log.js";
import { globalStream } from "./stream.js";
import { getTZ } from "./tz.js";
import { HOST_URL, mcpServerPath, clauDir } from "./config.js";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface RunPayload {
  chatId: string;
  message: string;
  history: Message[];
  timestamp: string;
  alert?: boolean;
}

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
  "mcp__minclaw__get_chat_history",
];

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

export function startAgent(): void {
  void drainMessages();
}

async function drainMessages(): Promise<never> {
  for await (const p of globalStream) {
    await runQuery(p).catch((err) => log.error(`runQuery error chatId=${p.chatId}: ${err}`));
  }
  log.error("globalStream ended unexpectedly");
  process.exit(1);
}

export function enqueue(payload: RunPayload): void {
  globalStream.push(payload);
}

async function runQuery(payload: RunPayload): Promise<void> {
  const context = payload.history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const prefix = payload.alert ? "[Scheduled alert]" : "User";
  const prompt = [context, `${prefix}: ${payload.message}`].filter(Boolean).join("\n\n");

  log.info(`run start  chatId=${payload.chatId}`);

  const mcpServers = {
    minclaw: {
      command: "node",
      args: [mcpServerPath],
      env: { CHAT_ID: payload.chatId, HOST_URL, TZ: await getTZ() },
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
