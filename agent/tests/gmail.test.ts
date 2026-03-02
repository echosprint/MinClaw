import { describe, test, expect, vi, beforeEach } from "vitest";
import { createGmailHandlers } from "../src/gmail-handlers.js";

const { draftsCreate, messagesSend, messagesList, messagesGet, eventsInsert, getProfile } =
  vi.hoisted(() => ({
    draftsCreate: vi.fn(),
    messagesSend: vi.fn(),
    messagesList: vi.fn(),
    messagesGet: vi.fn(),
    eventsInsert: vi.fn(),
    getProfile: vi.fn(),
  }));

vi.mock("googleapis", () => {
  function OAuth2(this: { setCredentials: () => void }) {
    this.setCredentials = vi.fn();
  }

  return {
    google: {
      auth: { OAuth2 },
      gmail: vi.fn().mockReturnValue({
        users: {
          drafts: { create: draftsCreate },
          messages: { send: messagesSend, list: messagesList, get: messagesGet },
          getProfile,
        },
      }),
      calendar: vi.fn().mockReturnValue({
        events: { insert: eventsInsert },
      }),
    },
  };
});

function makeHandlers() {
  return createGmailHandlers("client-id", "client-secret", "refresh-token");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("draft_email", () => {
  test("creates a draft and returns its ID", async () => {
    draftsCreate.mockResolvedValue({ data: { id: "draft-123" } });
    const h = makeHandlers();

    const result = await h.draft_email({ to: "a@b.com", subject: "Hi", body: "Hello" });

    expect(draftsCreate).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { message: { raw: expect.any(String) } },
    });
    expect(result.content[0].text).toBe("Draft created. ID: draft-123");
  });

  test('returns "unknown" when API returns no id', async () => {
    draftsCreate.mockResolvedValue({ data: {} });
    const h = makeHandlers();

    const result = await h.draft_email({ to: "a@b.com", subject: "Hi", body: "Hello" });

    expect(result.content[0].text).toBe("Draft created. ID: unknown");
  });
});

describe("send_email", () => {
  test("sends an email and returns the message ID", async () => {
    messagesSend.mockResolvedValue({ data: { id: "msg-456" } });
    const h = makeHandlers();

    const result = await h.send_email({ to: "a@b.com", subject: "Hi", body: "Hello" });

    expect(messagesSend).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { raw: expect.any(String) },
    });
    expect(result.content[0].text).toBe("Email sent. Message ID: msg-456");
  });
});

describe("summarize_emails", () => {
  test("returns formatted summary of emails", async () => {
    messagesList.mockResolvedValue({ data: { messages: [{ id: "m1" }, { id: "m2" }] } });
    messagesGet.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({
        data: {
          snippet: `snippet-${id}`,
          payload: {
            headers: [
              { name: "From", value: `sender-${id}@example.com` },
              { name: "Subject", value: `Subject ${id}` },
              { name: "Date", value: "Mon, 1 Jan 2025" },
            ],
          },
        },
      }),
    );
    const h = makeHandlers();

    const result = await h.summarize_emails({ query: "is:unread", max_results: 5 });

    expect(messagesList).toHaveBeenCalledWith({ userId: "me", q: "is:unread", maxResults: 5 });
    expect(result.content[0].text).toContain("Subject m1");
    expect(result.content[0].text).toContain("Subject m2");
    expect(result.content[0].text).toContain("snippet-m1");
  });

  test('returns "no emails" message when inbox is empty', async () => {
    messagesList.mockResolvedValue({ data: { messages: [] } });
    const h = makeHandlers();

    const result = await h.summarize_emails({});

    expect(result.content[0].text).toBe("No emails found matching your query.");
  });

  test("uses default query and max_results when not provided", async () => {
    messagesList.mockResolvedValue({ data: {} });
    const h = makeHandlers();

    await h.summarize_emails({});

    expect(messagesList).toHaveBeenCalledWith({ userId: "me", q: "is:unread", maxResults: 10 });
  });

  test("handles missing headers and snippet gracefully", async () => {
    messagesList.mockResolvedValue({ data: { messages: [{ id: "m1" }] } });
    messagesGet.mockResolvedValue({
      data: {
        // No payload, no snippet, no threadId
      },
    });
    const h = makeHandlers();

    const result = await h.summarize_emails({});
    // Should not throw — falls back to empty strings
    expect(result.content[0].text).toContain("1.");
  });
});

describe("check_gmail_service", () => {
  test("returns unavailable when credentials are missing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;
    const h = makeHandlers();

    const result = await h.check_gmail_service();
    expect(result.content[0].text).toContain("unavailable");
    expect(result.content[0].text).toContain("credentials not configured");
  });

  test("returns available with email when profile succeeds", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
    getProfile.mockResolvedValue({ data: { emailAddress: "user@example.com" } });

    const h = makeHandlers();
    const result = await h.check_gmail_service();
    expect(result.content[0].text).toContain("available");
    expect(result.content[0].text).toContain("user@example.com");
  });

  test("returns unavailable on API error", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
    getProfile.mockRejectedValue(new Error("auth failed"));

    const h = makeHandlers();
    const result = await h.check_gmail_service();
    expect(result.content[0].text).toContain("unavailable");
    expect(result.content[0].text).toContain("auth failed");
  });

  test("returns unavailable with non-Error thrown value", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
    getProfile.mockRejectedValue("string error");

    const h = makeHandlers();
    const result = await h.check_gmail_service();
    expect(result.content[0].text).toContain("unavailable");
    expect(result.content[0].text).toContain("string error");
  });
});

describe("encodeHeader", () => {
  test("encodes non-ASCII subjects as UTF-8 base64", async () => {
    draftsCreate.mockResolvedValue({ data: { id: "draft-utf8" } });
    const h = makeHandlers();

    await h.draft_email({ to: "a@b.com", subject: "日本語テスト", body: "Hello" });

    // The raw message should contain the encoded header
    const call = draftsCreate.mock.calls[0][0];
    const raw = call.requestBody.message.raw;
    // Decode the raw message to check the Subject header
    const decoded = Buffer.from(raw, "base64").toString();
    expect(decoded).toContain("=?UTF-8?B?");
  });
});

describe("draft_email reply threading", () => {
  test("includes threadId when replying", async () => {
    draftsCreate.mockResolvedValue({ data: { id: "draft-reply-1" } });
    const h = makeHandlers();

    await h.draft_email({
      to: "a@b.com",
      subject: "Re: Hi",
      body: "replying",
      thread_id: "thread-123",
      in_reply_to: "<msg-id@mail.com>",
      references: "<ref1@mail.com>",
    });

    expect(draftsCreate).toHaveBeenCalledWith({
      userId: "me",
      requestBody: {
        message: {
          raw: expect.any(String),
          threadId: "thread-123",
        },
      },
    });
  });
});

describe("send_email reply threading", () => {
  test("includes threadId when replying", async () => {
    messagesSend.mockResolvedValue({ data: { id: "msg-reply-1" } });
    const h = makeHandlers();

    await h.send_email({
      to: "a@b.com",
      subject: "Re: Hi",
      body: "replying",
      thread_id: "thread-456",
      in_reply_to: "<msg-id@mail.com>",
      references: "<ref1@mail.com>",
    });

    expect(messagesSend).toHaveBeenCalledWith({
      userId: "me",
      requestBody: {
        raw: expect.any(String),
        threadId: "thread-456",
      },
    });
  });

  test('returns "unknown" when send API returns no id', async () => {
    messagesSend.mockResolvedValue({ data: {} });
    const h = makeHandlers();

    const result = await h.send_email({ to: "a@b.com", subject: "Hi", body: "Hello" });
    expect(result.content[0].text).toBe("Email sent. Message ID: unknown");
  });
});

describe("add_calendar_event", () => {
  test("inserts event and returns confirmation with link", async () => {
    eventsInsert.mockResolvedValue({
      data: {
        id: "evt-789",
        summary: "Team Meeting",
        htmlLink: "https://calendar.google.com/evt-789",
      },
    });
    const h = makeHandlers();

    const result = await h.add_calendar_event({
      title: "Team Meeting",
      start: "2025-03-10T15:00:00",
      end: "2025-03-10T16:00:00",
      timezone: "America/New_York",
    });

    expect(eventsInsert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: {
        summary: "Team Meeting",
        description: undefined,
        start: { dateTime: "2025-03-10T15:00:00", timeZone: "America/New_York" },
        end: { dateTime: "2025-03-10T16:00:00", timeZone: "America/New_York" },
      },
    });
    expect(result.content[0].text).toBe(
      'Event created: "Team Meeting" — https://calendar.google.com/evt-789',
    );
  });

  test("defaults timezone to UTC when not provided", async () => {
    eventsInsert.mockResolvedValue({
      data: { summary: "Standup", htmlLink: "" },
    });
    const h = makeHandlers();

    await h.add_calendar_event({
      title: "Standup",
      start: "2025-03-10T09:00:00",
      end: "2025-03-10T09:30:00",
    });

    expect(eventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          start: { dateTime: "2025-03-10T09:00:00", timeZone: "UTC" },
          end: { dateTime: "2025-03-10T09:30:00", timeZone: "UTC" },
        }),
      }),
    );
  });

  test("handles missing htmlLink and summary", async () => {
    eventsInsert.mockResolvedValue({ data: {} });
    const h = makeHandlers();

    const result = await h.add_calendar_event({
      title: "Test",
      start: "2025-03-10T10:00:00",
      end: "2025-03-10T11:00:00",
    });
    expect(result.content[0].text).toContain("Event created");
  });

  test("passes description when provided", async () => {
    eventsInsert.mockResolvedValue({ data: { summary: "Review", htmlLink: "" } });
    const h = makeHandlers();

    await h.add_calendar_event({
      title: "Review",
      start: "2025-03-10T10:00:00",
      end: "2025-03-10T11:00:00",
      description: "Quarterly review",
    });

    expect(eventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ description: "Quarterly review" }),
      }),
    );
  });
});
