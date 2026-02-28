import { google } from "googleapis";
import { log } from "./log.js";

export interface ToolResult {
  [key: string]: unknown;
  content: [{ type: "text"; text: string }];
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

interface MailOptions {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function makeRfc2822({ to, subject, body, inReplyTo, references }: MailOptions): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push(``, Buffer.from(body, "utf8").toString("base64"));
  return lines.join("\r\n");
}

function encodeMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createGmailHandlers(clientId: string, clientSecret: string, refreshToken: string) {
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth });
  const calendar = google.calendar({ version: "v3", auth });

  const draft_email = async ({
    to,
    subject,
    body,
    thread_id,
    in_reply_to,
    references,
  }: {
    to: string;
    subject: string;
    body: string;
    thread_id?: string;
    in_reply_to?: string;
    references?: string;
  }): Promise<ToolResult> => {
    log.info(`draft_email to="${to}" subject="${subject}" reply=${!!in_reply_to}`);
    const raw = encodeMessage(makeRfc2822({ to, subject, body, inReplyTo: in_reply_to, references }));
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw, ...(thread_id ? { threadId: thread_id } : {}) } },
    });
    const result = `Draft created. ID: ${res.data.id ?? "unknown"}`;
    log.info(`draft_email result=${res.data.id}`);
    return ok(result);
  };

  const send_email = async ({
    to,
    subject,
    body,
    thread_id,
    in_reply_to,
    references,
  }: {
    to: string;
    subject: string;
    body: string;
    thread_id?: string;
    in_reply_to?: string;
    references?: string;
  }): Promise<ToolResult> => {
    log.info(`send_email to="${to}" subject="${subject}" reply=${!!in_reply_to}`);
    const raw = encodeMessage(makeRfc2822({ to, subject, body, inReplyTo: in_reply_to, references }));
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, ...(thread_id ? { threadId: thread_id } : {}) },
    });
    log.info(`send_email result=${res.data.id}`);
    return ok(`Email sent. Message ID: ${res.data.id ?? "unknown"}`);
  };

  const summarize_emails = async ({
    query = "is:unread",
    max_results = 10,
  }: {
    query?: string;
    max_results?: number;
  }): Promise<ToolResult> => {
    log.info(`summarize_emails query="${query}" max_results=${max_results}`);
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: max_results,
    });
    const messages = listRes.data.messages ?? [];
    log.info(`summarize_emails found=${messages.length}`);
    if (messages.length === 0) return ok("No emails found matching your query.");

    const summaries = await Promise.all(
      messages.map(async (m) => {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date", "Message-ID", "References"],
        });
        const headers = msg.data.payload?.headers ?? [];
        const get = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
        return {
          from: get("From"),
          subject: get("Subject"),
          date: get("Date"),
          snippet: msg.data.snippet ?? "",
          message_id: get("Message-ID"),
          references: get("References"),
          thread_id: msg.data.threadId ?? "",
        };
      }),
    );

    const text = summaries
      .map(
        (s, i) =>
          `${i + 1}. **${s.subject}**\n   From: ${s.from}\n   Date: ${s.date}\n   ${s.snippet}\n   [thread_id:${s.thread_id} message_id:${s.message_id} references:${s.references}]`,
      )
      .join("\n\n");
    return ok(text);
  };

  const add_calendar_event = async ({
    title,
    start,
    end,
    description,
    timezone = "UTC",
  }: {
    title: string;
    start: string;
    end: string;
    description?: string;
    timezone?: string;
  }): Promise<ToolResult> => {
    log.info(`add_calendar_event title="${title}" start="${start}" end="${end}" tz="${timezone}"`);
    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        start: { dateTime: start, timeZone: timezone },
        end: { dateTime: end, timeZone: timezone },
      },
    });
    log.info(`add_calendar_event result=${res.data.id}`);
    return ok(`Event created: "${res.data.summary}" — ${res.data.htmlLink ?? ""}`);
  };

  const check_gmail_service = async (): Promise<ToolResult> => {
    log.info("check_gmail_service");
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
      return ok("unavailable: Google credentials not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN missing)");
    }
    try {
      const profile = await gmail.users.getProfile({ userId: "me" });
      const email = profile.data.emailAddress ?? "unknown";
      log.info(`check_gmail_service ok email=${email}`);
      return ok(`available: connected as ${email}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.info(`check_gmail_service error=${msg}`);
      return ok(`unavailable: ${msg}`);
    }
  };

  return { check_gmail_service, draft_email, send_email, summarize_emails, add_calendar_event };
}
