import { describe, test, beforeAll } from "vitest";
import { expect } from "vitest";
import * as db from "../src/db";

describe("db: messages", () => {
  beforeAll(() => {
    db.init(":memory:");
  });

  test("saves and retrieves history in chronological order", () => {
    db.saveMessage("chat1", "user", "hello");
    db.saveMessage("chat1", "assistant", "hi there");

    const history = db.getHistory("chat1");
    expect(history.length).toBe(2);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("hello");
    expect(history[1].role).toBe("assistant");
  });

  test("getHistory is scoped to chatId", () => {
    db.saveMessage("chat2", "user", "chat2 only");
    const history = db.getHistory("chat1");
    expect(history.every((m) => m.chat_id === "chat1")).toBe(true);
  });

  test("getHistory respects limit", () => {
    for (let i = 0; i < 25; i++) db.saveMessage("chat3", "user", `msg ${i}`);
    const history = db.getHistory("chat3", 20);
    expect(history.length).toBe(20);
  });
});

describe("db: jobs", () => {
  beforeAll(() => {
    db.init(":memory:");
  });

  test("due jobs are returned when next_run is in the past", () => {
    const id = db.addJob("chat1", "* * * * *", "check btc", Date.now() - 1000);
    const due = db.getDueJobs();
    expect(due.some((j) => j.id === id)).toBe(true);
  });

  test("future jobs are not returned as due", () => {
    const id = db.addJob("chat1", "0 16 * * *", "check eth", Date.now() + 60_000);
    const due = db.getDueJobs();
    expect(due.some((j) => j.id === id)).toBe(false);
  });

  test("advanceJob moves next_run to future so job leaves due list", () => {
    const id = db.addJob("chat1", "0 15 * * *", "some task", Date.now() - 1000);
    db.advanceJob(id, Date.now() + 86_400_000);
    const due = db.getDueJobs();
    expect(due.some((j) => j.id === id)).toBe(false);
  });

  test("deactivateJob removes job from due list permanently", () => {
    const id = db.addJob("chat1", "* * * * *", "task", Date.now() - 1000);
    db.deactivateJob(id);
    const due = db.getDueJobs();
    expect(due.some((j) => j.id === id)).toBe(false);
  });
});
