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

  test("clearHistory removes messages for that chatId only", () => {
    db.saveMessage("chatA", "user", "msg A");
    db.saveMessage("chatB", "user", "msg B");
    db.clearHistory("chatA");
    expect(db.getHistory("chatA").length).toBe(0);
    expect(db.getHistory("chatB").length).toBeGreaterThan(0);
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

  test("getActiveJobs returns only active jobs for that chatId", () => {
    const id1 = db.addJob("chatX", "0 9 * * *", "task1", Date.now());
    const id2 = db.addJob("chatX", "0 10 * * *", "task2", Date.now());
    db.addJob("chatY", "0 11 * * *", "otherChat", Date.now());
    db.deactivateJob(id2);

    const jobs = db.getActiveJobs("chatX");
    expect(jobs.some((j) => j.id === id1)).toBe(true);
    expect(jobs.some((j) => j.id === id2)).toBe(false);
    expect(jobs.every((j) => j.chat_id === "chatX")).toBe(true);
  });

  test("cancelJob deactivates a job matching id and chatId", () => {
    const id = db.addJob("chatC", "* * * * *", "cancel me", Date.now());
    const cancelled = db.cancelJob(id, "chatC");
    expect(cancelled).toBe(true);
    expect(db.getActiveJobs("chatC").some((j) => j.id === id)).toBe(false);
  });

  test("cancelJob returns false when chatId does not match", () => {
    const id = db.addJob("chatD", "* * * * *", "task", Date.now());
    const cancelled = db.cancelJob(id, "wrong-chat");
    expect(cancelled).toBe(false);
  });

  test("addJob stores one_shot flag correctly", () => {
    const id = db.addJob("chatE", "0 9 * * *", "once", Date.now(), true);
    const jobs = db.getActiveJobs("chatE");
    const job = jobs.find((j) => j.id === id);
    expect(job?.one_shot).toBe(1);
  });
});
