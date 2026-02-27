import { describe, test, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createServer } from "../src/server.js";
import type { RunPayload } from "../src/runner.js";

const PORT = 4099;

describe("agent server", () => {
  let server: http.Server;
  const runs: RunPayload[] = [];

  beforeAll(() => {
    server = createServer(
      {
        enqueue: (payload) => {
          runs.push(payload);
        },
      },
      PORT,
    );
  });

  afterAll(() => server.close());

  test("POST /run → 202 immediately", async () => {
    const res = await fetch(`http://localhost:${PORT}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: "c1", message: "hello", history: [] }),
    });
    expect(res.status).toBe(202);
  });

  test("POST /run passes payload to runner asynchronously", async () => {
    runs.length = 0;
    await fetch(`http://localhost:${PORT}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: "c2", message: "test msg", history: [] }),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(runs.some((r) => r.chatId === "c2" && r.message === "test msg")).toBe(true);
  });

  test("GET /health → { ok: true, claude: false } (no token in test env)", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, claude: false });
  });

  test("unknown route → 404", async () => {
    const res = await fetch(`http://localhost:${PORT}/unknown`);
    expect(res.status).toBe(404);
  });
});
