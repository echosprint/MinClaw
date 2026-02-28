import { describe, test, expect, vi, beforeEach } from "vitest";
import { createGmailHandlers } from "../src/gmail-handlers.js";

const { draftsCreate, messagesSend, messagesList, messagesGet, eventsInsert } = vi.hoisted(() => ({
  draftsCreate: vi.fn(),
  messagesSend: vi.fn(),
  messagesList: vi.fn(),
  messagesGet: vi.fn(),
  eventsInsert: vi.fn(),
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
