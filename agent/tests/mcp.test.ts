import { describe, test, expect, vi, beforeEach } from "vitest";
import { createHandlers } from "../src/mcp-handlers.js";

const HOST_URL = "http://test-host:3000";
const CHAT_ID = "chat-42";

describe("MCP tool handlers", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  describe("send_message", () => {
    test('POSTs text to /send and returns "sent" on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.send_message({ text: "Hello!" });

      expect(mockFetch).toHaveBeenCalledWith(`${HOST_URL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: CHAT_ID, text: "Hello!" }),
      });
      expect(result.content[0].text).toBe("sent");
    });

    test("returns error status when host responds with failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.send_message({ text: "Hello!" });

      expect(result.content[0].text).toBe("error: 503");
    });
  });

  describe("schedule_job", () => {
    test("POSTs cron job to /schedule and returns job ID", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ jobId: 7 }), { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.schedule_job({ cron: "0 9 * * *", task: "Morning summary" });

      expect(mockFetch).toHaveBeenCalledWith(`${HOST_URL}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: CHAT_ID, cron: "0 9 * * *", task: "Morning summary" }),
      });
      expect(result.content[0].text).toBe("Scheduled job #7");
    });

    test("returns host error message on invalid cron", async () => {
      const errorMsg = 'Invalid cron: "not-a-cron". Use format like "0 9 * * *"';
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({ error: errorMsg }), { status: 400 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.schedule_job({ cron: "not-a-cron", task: "Whatever" });

      expect(result.content[0].text).toBe(errorMsg);
    });

    test("falls back to generic error when host returns 400 with no body", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 400 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.schedule_job({ cron: "not-a-cron", task: "Whatever" });

      expect(result.content[0].text).toBe("schedule failed: 400");
    });

    test("passes one_shot flag to host", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ jobId: 8 }), { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);
      const h = createHandlers(HOST_URL, CHAT_ID);

      await h.schedule_job({ cron: "0 9 * * *", task: "once", one_shot: true });

      // Find the /schedule call (log.info also calls fetch for log forwarding)
      const scheduleCall = mockFetch.mock.calls.find(([url]: [string]) =>
        url.includes("/schedule"),
      );
      expect(scheduleCall).toBeDefined();
      const body = JSON.parse(scheduleCall![1].body);
      expect(body.one_shot).toBe(true);
    });
  });

  describe("list_tasks", () => {
    test("returns formatted task list on success", async () => {
      const jobs = [
        { id: 1, cron: "0 9 * * *", task: "Morning summary", next_run: Date.now() + 60000, one_shot: 0 },
        { id: 2, cron: "0 17 * * 5", task: "Friday report", next_run: Date.now() + 60000, one_shot: 1 },
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(jobs), { status: 200 })),
      );
      process.env.TZ = "UTC";
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.list_tasks();

      expect(result.content[0].text).toContain("Scheduled tasks:");
      expect(result.content[0].text).toContain("Morning summary");
      expect(result.content[0].text).toContain("recurring");
      expect(result.content[0].text).toContain("one-time");
    });

    test("returns no tasks message when empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.list_tasks();
      expect(result.content[0].text).toBe("No scheduled tasks.");
    });

    test("returns error on failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.list_tasks();
      expect(result.content[0].text).toContain("list_tasks failed");
    });

    test("truncates long task descriptions to 60 chars", async () => {
      const longTask = "A".repeat(100);
      const jobs = [{ id: 1, cron: "0 9 * * *", task: longTask, next_run: Date.now(), one_shot: 0 }];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(jobs), { status: 200 })),
      );
      process.env.TZ = "UTC";
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.list_tasks();
      expect(result.content[0].text).toContain("…");
      expect(result.content[0].text).not.toContain(longTask);
    });
  });

  describe("cancel_task", () => {
    test("returns success message when cancelled", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ cancelled: true }), { status: 200 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.cancel_task({ job_id: 5 });
      expect(result.content[0].text).toBe("Job #5 cancelled.");
    });

    test("returns not found message when not cancelled", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ cancelled: false }), { status: 200 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.cancel_task({ job_id: 99 });
      expect(result.content[0].text).toBe("Job #99 not found.");
    });
  });

  describe("get_local_time", () => {
    test("returns current time with timezone", async () => {
      process.env.TZ = "America/New_York";
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.get_local_time();
      expect(result.content[0].text).toContain("Current time:");
      expect(result.content[0].text).toContain("America/New_York");
    });
  });

  describe("get_chat_history", () => {
    test("returns formatted history on success", async () => {
      const messages = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(messages), { status: 200 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.get_chat_history({ limit: 10 });
      expect(result.content[0].text).toContain("User: hello");
      expect(result.content[0].text).toContain("Assistant: hi there");
    });

    test("returns no history message when empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.get_chat_history({});
      expect(result.content[0].text).toBe("No chat history.");
    });

    test("uses default limit of 20", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);
      const h = createHandlers(HOST_URL, CHAT_ID);

      await h.get_chat_history({});
      expect(mockFetch.mock.calls[0][0]).toContain("limit=20");
    });

    test("returns error on failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
      );
      const h = createHandlers(HOST_URL, CHAT_ID);

      const result = await h.get_chat_history({});
      expect(result.content[0].text).toContain("get_chat_history failed");
    });
  });
});
