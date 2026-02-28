import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createGmailHandlers } from "./gmail-handlers.js";

const server = new McpServer({ name: "gmail", version: "1.0.0" });
const handlers = createGmailHandlers(
  process.env.GOOGLE_CLIENT_ID ?? "",
  process.env.GOOGLE_CLIENT_SECRET ?? "",
  process.env.GOOGLE_REFRESH_TOKEN ?? "",
);

server.registerTool(
  "check_gmail_service",
  {
    description:
      "Check whether Gmail and Google Calendar are available. Call this first if you are not sure the credentials are configured before attempting any gmail or calendar tool.",
  },
  handlers.check_gmail_service,
);

const replySchema = {
  thread_id: z.string().optional().describe("Gmail thread ID from summarize_emails — required when replying to keep the conversation threaded"),
  in_reply_to: z.string().optional().describe("Message-ID header of the email being replied to (from summarize_emails)"),
  references: z.string().optional().describe("References header chain from the original email (from summarize_emails)"),
};

server.registerTool(
  "draft_email",
  {
    description:
      "Create a Gmail draft. Use this when the user wants to prepare an email without sending it yet. When replying, pass thread_id, in_reply_to, and references from summarize_emails so the reply is threaded correctly and include the quoted original in the body.",
    inputSchema: {
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line — prefix with 'Re: ' when replying"),
      body: z.string().describe("Plain text email body — include the quoted original at the bottom when replying"),
      ...replySchema,
    },
  },
  handlers.draft_email,
);

server.registerTool(
  "send_email",
  {
    description:
      "Send an email immediately via Gmail. ONLY call this tool after the user has explicitly confirmed they want to send — never send without confirmation. When in doubt, use draft_email instead. When replying, pass thread_id, in_reply_to, and references from summarize_emails.",
    inputSchema: {
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line — prefix with 'Re: ' when replying"),
      body: z.string().describe("Plain text email body — include the quoted original at the bottom when replying"),
      ...replySchema,
    },
  },
  handlers.send_email,
);

server.registerTool(
  "summarize_emails",
  {
    description:
      "List and summarize recent or unread emails — returns sender, subject, date, and a snippet for each.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe(
          'Gmail search query (default: "is:unread"). Examples: "is:unread", "from:boss@example.com", "newer_than:1d"',
        ),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max number of emails to return (default: 10)"),
    },
  },
  handlers.summarize_emails,
);

server.registerTool(
  "add_calendar_event",
  {
    description: "Add an event to Google Calendar.",
    inputSchema: {
      title: z.string().describe("Event title"),
      start: z
        .string()
        .describe("Start time in ISO 8601 format, e.g. 2025-03-10T15:00:00 (local time)"),
      end: z
        .string()
        .describe("End time in ISO 8601 format, e.g. 2025-03-10T16:00:00 (local time)"),
      description: z.string().optional().describe("Optional event description or notes"),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone name, e.g. America/New_York. Defaults to UTC if not provided."),
    },
  },
  handlers.add_calendar_event,
);

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
