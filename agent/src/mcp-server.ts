import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { McpHandlers } from "./mcp-handlers.js";

const CHAT_ID = process.env.CHAT_ID ?? "";
const HOST_URL = process.env.HOST_URL ?? "http://host.docker.internal:13821";

const server = new McpServer({ name: "minclaw", version: "1.0.0" });
const handlers = new McpHandlers(HOST_URL, CHAT_ID);

server.registerTool(
  "send_message",
  {
    description:
      "Send a message to the user on Telegram. This is the ONLY way to communicate — use it for all responses, progress updates, and results. You can call it multiple times. Your final output text is NOT automatically sent; you must explicitly call this tool.",
    inputSchema: {
      text: z
        .string()
        .describe(
          "Message text to send (supports Markdown: **bold**, _italic_, `code`, ```block```, [label](url))",
        ),
    },
  },
  handlers.send_message,
);

server.registerTool(
  "schedule_job",
  {
    description: `Schedule a recurring or one-time task. The task runs as a full agent with access to all tools.

CRON FORMAT — 5 fields, space-separated, LOCAL timezone:
  ┌─ minute      (0-59)
  │ ┌─ hour       (0-23)
  │ │ ┌─ day of month (1-31)
  │ │ │ ┌─ month      (1-12)
  │ │ │ │ ┌─ day of week  (0-6, 0=Sun)
  * * * * *
Special: * (any)  , (list: 1,3,5)  - (range: 1-5)  / (step: */10)

EXAMPLES:
• "0 8 * * *"     — daily morning briefing at 8am
• "0 9 * * 1"     — weekly review every Monday at 9am
• "0 9 * * 1-5"   — weekday standup at 9am
• "0 12,18 * * *" — lunch and dinner reminders
• "*/30 * * * *"  — check prices every 30 minutes
• "0 10 1 * *"    — monthly report on the 1st at 10am
• "0 22 * * *"    — nightly summary at 10pm
• "0 9,21 * * *"  — twice daily at 9am and 9pm

RECURRING vs ONE-TIME:
• Recurring: omit one_shot (default). Fires on every matching tick.
• One-time: set one_shot=true. Fires once at the next matching tick, then deactivates.

ONE-TIME REMINDERS — run \`date\` first to get current time, then calculate:
• In 10 min (currently 14:22) → "32 14 * * *"  one_shot=true
• Tomorrow 9am                → "0 9 * * *"    one_shot=true
• Next Friday 5pm             → "0 17 * * 5"   one_shot=true`,
    inputSchema: {
      cron: z
        .string()
        .describe(
          '5-field cron expression in local time. E.g. "0 9 * * *" (daily 9am), "*/30 * * * *" (every 30 min), "0 8 * * 1" (Mondays 8am)',
        ),
      task: z
        .string()
        .describe(
          "What the agent should do when the job runs. Be specific — include all context needed, as the agent starts fresh each time.",
        ),
      one_shot: z
        .boolean()
        .optional()
        .describe(
          "If true, fires once at the next cron tick then deactivates. Use for reminders and one-time tasks. Default: false (recurring).",
        ),
    },
  },
  handlers.schedule_job,
);

server.registerTool(
  "list_tasks",
  { description: "List all active scheduled tasks for this chat." },
  handlers.list_tasks,
);

server.registerTool(
  "cancel_task",
  {
    description:
      "Cancel and deactivate a scheduled task by its ID. Use list_tasks first to find the ID.",
    inputSchema: { job_id: z.number().int().describe("The task ID to cancel (from list_tasks)") },
  },
  handlers.cancel_task,
);

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
