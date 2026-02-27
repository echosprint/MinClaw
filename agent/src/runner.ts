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
}

const HOST_URL = process.env.HOST_URL ?? "http://host.docker.internal:13821";

export async function run(payload: RunPayload): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // always use compiled dist — works from src/ (dev) and dist/ (prod)
  const mcpServerPath = path.resolve(__dirname, "..", "dist", "mcp-server.js");

  const context = payload.history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = context ? `${context}\n\nUser: ${payload.message}` : payload.message;

  // .claude/CLAUDE.md is auto-loaded as project context (persona + communication rules)
  // .claude/skills/agent-browser is loaded as a plugin (agent-browser skill)
  const clauDir = path.join(__dirname, "..", ".claude");

  log.info(`run start  chatId=${payload.chatId}`);

  for await (const msg of query({
    prompt,
    options: {
      cwd: "/workspace",
      plugins: [{ type: "local", path: path.join(clauDir, "skills", "agent-browser") }],
      allowedTools: [
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
        "mcp__minclaw__send_message",
        "mcp__minclaw__schedule_job",
      ],
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      settingSources: ["project", "user"] as SettingSource[],
      mcpServers: {
        minclaw: {
          command: "node",
          args: [mcpServerPath],
          env: {
            CHAT_ID: payload.chatId,
            HOST_URL,
          },
        },
      },
    },
  })) {
    const m = msg as Record<string, unknown>;
    if (m.type === "assistant") {
      const content = (m.message as Record<string, unknown>)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "text") {
            log.info(`agent text  "${String(b.text).slice(0, 100)}"`);
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
