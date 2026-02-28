import { describe, test, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createServer } from "../src/server";

const PORT = 3099;

describe("host server", () => {
  let server: http.Server;
  const sent: { chatId: string; text: string }[] = [];
  const savedMsgs: { chatId: string; role: string; content: string }[] = [];
  const savedJobs: { chatId: string; cron: string; task: string }[] = [];

  beforeAll(() => {
    server = createServer(
      {
        sendToTelegram: async (chatId, text) => {
          sent.push({ chatId, text });
        },
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
});
