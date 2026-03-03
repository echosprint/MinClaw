import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import http from "http";
import { createServer } from "../src/server";

const PORT = 3099;

describe("host server", () => {
  let server: http.Server;
  const sent: { chatId: string; text: string }[] = [];
  const savedMsgs: { chatId: string; role: string; content: string }[] = [];
  const savedJobs: { chatId: string; cron: string; task: string }[] = [];
  const sendTyping = vi.fn(async () => {});

  beforeAll(() => {
    server = createServer(
      {
        sendToTelegram: async (chatId, text) => {
          sent.push({ chatId, text });
        },
        sendTyping,
        saveMessage: (chatId, role, content) => {
          savedMsgs.push({ chatId, role, content });
        },
        addJob: (chatId, cron, task, _nextRun) => {
          savedJobs.push({ chatId, cron, task });
          return savedJobs.length;
        },
        getActiveJobs: () => [],
        cancelJob: () => false,
        getHistory: () => [],
      },
      PORT,
    );
  });

  afterAll(() => server.close());

  async function post(path: string, body: unknown) {
    return fetch(`http://localhost:${PORT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("POST /send → 200, forwards to telegram and saves assistant message", async () => {
    const res = await post("/send", { chatId: "c1", text: "hello from agent" });
    expect(res.status).toBe(200);
    expect(sent.some((m) => m.chatId === "c1" && m.text === "hello from agent")).toBe(true);
    expect(savedMsgs.some((m) => m.chatId === "c1" && m.role === "assistant")).toBe(true);
  });

  test("POST /schedule with valid cron → 200 with jobId", async () => {
    const res = await post("/schedule", { chatId: "c1", cron: "0 15 * * *", task: "check BTC" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { jobId: number };
    expect(typeof data.jobId).toBe("number");
    expect(data.jobId).toBeGreaterThan(0);
  });

  test("POST /schedule with invalid cron → 400", async () => {
    const res = await post("/schedule", { chatId: "c1", cron: "not-valid", task: "whatever" });
    expect(res.status).toBe(400);
  });

  test("unknown route → 404", async () => {
    const res = await fetch(`http://localhost:${PORT}/unknown`);
    expect(res.status).toBe(404);
  });

  test("GET /health → 200 with ok:true", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  test("GET /timezone → 200 with timezone string", async () => {
    const res = await fetch(`http://localhost:${PORT}/timezone`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { timezone: string };
    expect(typeof data.timezone).toBe("string");
    expect(data.timezone.length).toBeGreaterThan(0);
  });

  test("POST /log → 200", async () => {
    const res = await post("/log", { level: "info", msg: "test log" });
    expect(res.status).toBe(200);
  });

  test("POST /log with missing fields uses defaults", async () => {
    const res = await post("/log", {});
    expect(res.status).toBe(200);
  });

  test("GET /history → 200 with empty array", async () => {
    const res = await fetch(`http://localhost:${PORT}/history?chatId=c1&limit=10`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  test("GET /history uses defaults when params missing", async () => {
    const res = await fetch(`http://localhost:${PORT}/history`);
    expect(res.status).toBe(200);
  });

  test("GET /jobs → 200 with empty array", async () => {
    const res = await fetch(`http://localhost:${PORT}/jobs?chatId=c1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  test("GET /jobs uses empty chatId when param missing", async () => {
    const res = await fetch(`http://localhost:${PORT}/jobs`);
    expect(res.status).toBe(200);
  });

  test("POST /cancel-job → 200 with cancelled:false", async () => {
    const res = await post("/cancel-job", { chatId: "c1", jobId: 999 });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cancelled: boolean };
    expect(data.cancelled).toBe(false);
  });

  test("POST /schedule with one_shot → 200 with jobId", async () => {
    const res = await post("/schedule", {
      chatId: "c1",
      cron: "0 9 * * *",
      task: "once",
      one_shot: true,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { jobId: number };
    expect(typeof data.jobId).toBe("number");
  });

  test("POST /typing → 200, calls sendTyping with correct chatId", async () => {
    sendTyping.mockClear();
    const res = await post("/typing", { chatId: "c1" });
    expect(res.status).toBe(200);
    expect(sendTyping).toHaveBeenCalledWith("c1");
  });

  test("POST /send handles sendToTelegram error → 500", async () => {
    // We need a separate server instance with a throwing sendToTelegram
    const errorServer = createServer(
      {
        sendToTelegram: async () => {
          throw new Error("Telegram API error");
        },
        sendTyping: async () => {},
        saveMessage: () => {},
        addJob: () => 1,
        getActiveJobs: () => [],
        cancelJob: () => false,
        getHistory: () => [],
      },
      PORT + 1,
    );

    try {
      const res = await fetch(`http://localhost:${PORT + 1}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "c1", text: "fail" }),
      });
      expect(res.status).toBe(500);
    } finally {
      errorServer.close();
    }
  });
});
