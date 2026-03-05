import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing agent
vi.mock("child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, "", "");
  }),
}));

// Capture fetch calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { dispatch, health, restartAgent } from "../src/agent";

beforeEach(() => {
  mockFetch.mockReset();
});

describe("dispatch", () => {
  test("POSTs payload with timestamp to /enqueue", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 202 }));

    await dispatch({ chatId: "c1", message: "hello", history: [] });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/enqueue");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.chatId).toBe("c1");
    expect(body.message).toBe("hello");
    expect(body.timestamp).toBeDefined();
  });

  test("logs [alert] prefix for alert payloads", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 202 }));

    await dispatch({ chatId: "c1", message: "task", history: [], alert: true });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.alert).toBe(true);
  });
});

describe("health", () => {
  test("returns agentOk and claudeOk from response", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, claude: true }), { status: 200 }),
    );

    const result = await health();
    expect(result).toEqual({ agentOk: true, claudeOk: true });
  });

  test("returns false for both when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));

    const result = await health();
    expect(result).toEqual({ agentOk: false, claudeOk: false });
  });

  test("returns correct values when claude is false", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, claude: false }), { status: 200 }),
    );

    const result = await health();
    expect(result).toEqual({ agentOk: true, claudeOk: false });
  });
});

describe("restartAgent", () => {
  test("calls docker-compose.sh restart agent", async () => {
    const { execFile } = await import("child_process");
    await restartAgent();
    expect(execFile).toHaveBeenCalledWith(
      "./docker-compose.sh",
      ["restart", "agent"],
      expect.objectContaining({ cwd: expect.any(String) }),
      expect.any(Function),
    );
  });
});
