import { describe, test, expect } from "vitest";
import { tick } from "../src/scheduler";
import type { Job } from "../src/db";
import type { RunPayload } from "../src/agent";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    chat_id: "chat1",
    cron: "* * * * *",
    task: "check btc price",
    next_run: Date.now() - 1000,
    active: 1,
    one_shot: 0,
    ...overrides,
  };
}

describe("scheduler: tick", () => {
  test("calls runAgent for each due job", async () => {
    const called: RunPayload[] = [];

    await tick({
      getDueJobs: () => [makeJob()],
      advanceJob: () => {},
      deactivateJob: () => {},
      runAgent: async (p) => {
        called.push(p);
      },
    });

    expect(called.length).toBe(1);
    expect(called[0].chatId).toBe("chat1");
    expect(called[0].message).toBe("check btc price");
  });

  test("passes empty history to runAgent for scheduled jobs", async () => {
    const called: RunPayload[] = [];

    await tick({
      getDueJobs: () => [makeJob()],
      advanceJob: () => {},
      deactivateJob: () => {},
      runAgent: async (p) => {
        called.push(p);
      },
    });

    expect(called[0].history).toEqual([]);
  });

  test("advances job after running with a future next_run", async () => {
    const advanced: Array<{ id: number; nextRun: number }> = [];

    await tick({
      getDueJobs: () => [makeJob({ id: 42, cron: "0 15 * * *" })],
      advanceJob: (id, nextRun) => {
        advanced.push({ id, nextRun });
      },
      deactivateJob: () => {},
      runAgent: async () => {},
    });

    expect(advanced.length).toBe(1);
    expect(advanced[0].id).toBe(42);
    expect(advanced[0].nextRun).toBeGreaterThan(Date.now());
  });

  test("skips runAgent when no due jobs", async () => {
    let agentCalled = false;

    await tick({
      getDueJobs: () => [],
      advanceJob: () => {},
      deactivateJob: () => {},
      runAgent: async () => {
        agentCalled = true;
      },
    });

    expect(agentCalled).toBe(false);
  });
});
