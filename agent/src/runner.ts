import { query, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import { log } from "./log.js";
import { globalStream } from "./stream.js";
import { getTZ } from "./tz.js";
import { HOST_URL, mcpServerPath, gmailMcpServerPath, claudeDir } from "./config.js";

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
  // Gmail MCP tools
  "mcp__gmail__check_gmail_service",
  "mcp__gmail__draft_email",
  "mcp__gmail__send_email",
  "mcp__gmail__summarize_emails",
  "mcp__gmail__add_calendar_event",
];

const options = {
  cwd: "/workspace",
  plugins: [
    { type: "local" as const, path: path.join(claudeDir, "skills", "agent-browser") },
    { type: "local" as const, path: path.join(claudeDir, "skills", "weather") },
    { type: "local" as const, path: path.join(claudeDir, "skills", "github") },
    { type: "local" as const, path: path.join(claudeDir, "skills", "news") },
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
  // Each message spawns a fresh Claude agent instance (via query()).
  // Runs are sequential — the next message waits until the current one finishes.
  for await (const p of globalStream) {
    await runQuery(p).catch((err) => log.error(`runQuery error chatId=${p.chatId}: ${err}`));
  }
  log.error("globalStream ended unexpectedly");
  process.exit(1);
}

// Called by the HTTP server to hand off an incoming message to the agent queue.
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
      // CHAT_ID scopes every MCP tool call to the originating conversation.
      // The MCP server is spawned fresh per run, so it has no other way to
      // know which chat to send replies to or query history for.
      env: { CHAT_ID: payload.chatId, HOST_URL, TZ: await getTZ() },
    },
    gmail: {
      command: "node",
      args: [gmailMcpServerPath],
      env: {
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
        GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN ?? "",
      },
    },
  };

  /*
   * query() runs the full Claude agentic loop autonomously — tool calls,
   * MCP execution, and result feeding all happen inside it. We don't drive
   * the loop; we only observe the message stream it emits for logging.
   *
   * Message types:
   *   "assistant" — Claude's turn: "text" (reasoning) or "tool_use" (tool call)
   *   "result"    — final outcome of the loop (success / error / timeout)
   */
  for await (const msg of query({ prompt, options: { ...options, mcpServers } })) {
    const m = msg as Record<string, unknown>;
    if (m.type === "assistant") {
      // Each assistant turn carries an array of content blocks.
      // A single turn can mix text and tool_use blocks (e.g. Claude reasons
      // in text, then immediately calls a tool in the same response).
      const content = (m.message as Record<string, unknown>)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "text") {
            // Claude's internal reasoning or the reply it will send via send_message.
            // Not delivered to the user directly — Claude must call send_message for that.
            log.info(`\x1b[33m[agent text]\x1b[0m "${String(b.text).slice(0, 500)}"`);
          } else if (b.type === "tool_use") {
            // Claude is invoking a tool. query() handles execution automatically;
            // we just log the name and input for observability.
            const inputSummary = JSON.stringify(b.input ?? {}).slice(0, 200);
            log.info(`\x1b[32m[tool use]\x1b[0m ${b.name}  ${inputSummary}`);
          }
        }
      }
    } else if (m.type === "result") {
      log.info(`run result  subtype=${m.subtype}`);
    }
  }

  log.info(`run done   chatId=${payload.chatId}`);
}
