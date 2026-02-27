import { describe, test, expect, vi, beforeEach } from "vitest";
import { McpHandlers } from "../src/mcp-handlers.js";

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
      const h = new McpHandlers(HOST_URL, CHAT_ID);

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
      const h = new McpHandlers(HOST_URL, CHAT_ID);

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
      const h = new McpHandlers(HOST_URL, CHAT_ID);

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
      const h = new McpHandlers(HOST_URL, CHAT_ID);

      const result = await h.schedule_job({ cron: "not-a-cron", task: "Whatever" });

      expect(result.content[0].text).toBe(errorMsg);
    });

    test("falls back to generic error when host returns 400 with no body", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 400 })),
      );
      const h = new McpHandlers(HOST_URL, CHAT_ID);

      const result = await h.schedule_job({ cron: "not-a-cron", task: "Whatever" });

      expect(result.content[0].text).toBe("schedule failed: 400");
    });
  });
});
