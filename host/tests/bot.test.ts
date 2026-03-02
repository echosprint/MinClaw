import fs from "fs";
import path from "path";
import { describe, test, expect, beforeAll, vi } from "vitest";
import * as db from "../src/db";
import { createBot } from "../src/bot";
import type { RunPayload } from "../src/agent";

const TEST_USER_ID = 99;

// Mock the allowlist file so tests never touch the real TELEGRAM_ALLOWED_IDS
const ALLOWLIST_PATH = path.resolve(__dirname, "../../TELEGRAM_ALLOWED_IDS");
const origReadFileSync = fs.readFileSync;
vi.spyOn(fs, "readFileSync").mockImplementation(((p: string, ...args: unknown[]) => {
  if (path.resolve(p) === ALLOWLIST_PATH) return String(TEST_USER_ID);
  return (origReadFileSync as Function).call(fs, p, ...args);
}) as typeof fs.readFileSync);

const TEST_BOT_INFO = {
  id: 1,
  is_bot: true as const,
  first_name: "TestBot",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

function makeBotWithMockedApi(overrides?: {
  clearHistory?: (chatId: string) => void;
  restartAgent?: () => Promise<void>;
  runAgent?: (payload: RunPayload) => Promise<void>;
}) {
  const runAgent = overrides?.runAgent ?? vi.fn(async () => {});
  const bot = createBot(
    "fake-token",
    {
      saveMessage: db.saveMessage.bind(db),
      getHistory: db.getHistory.bind(db),
      dispatch: runAgent,
      clearHistory: overrides?.clearHistory ?? vi.fn(),
      restartAgent: overrides?.restartAgent ?? vi.fn(async () => {}),
    },
    TEST_BOT_INFO,
  );

  const replies: string[] = [];
  bot.api.config.use((_prev, method, payload, _signal) => {
    if (method === "sendMessage") {
      replies.push((payload as any).text);
    }
    return Promise.resolve({ ok: true, result: true } as any);
  });

  return { bot, runAgent: runAgent as ReturnType<typeof vi.fn>, replies };
}

function makeUpdate(chatId: number, text: string, updateId = 1) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: chatId, type: "private" as const, first_name: "User" },
      from: { id: TEST_USER_ID, is_bot: false as const, first_name: "User" },
      text,
      date: Math.floor(Date.now() / 1000),
      entities: text.startsWith("/")
        ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0].length }]
        : undefined,
    },
  };
}

describe("bot: message handling", () => {
  beforeAll(() => {
    db.init(":memory:");
  });

  test("saves user message to db on incoming text", async () => {
    const { bot } = makeBotWithMockedApi();
    await bot.handleUpdate(makeUpdate(12345, "hello bot"));

    const history = db.getHistory("12345");
    expect(history.length).toBe(1);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("hello bot");
  });

  test("history accumulates across multiple messages", async () => {
    const { bot } = makeBotWithMockedApi();
    await bot.handleUpdate(makeUpdate(12345, "second message", 2));

    const history = db.getHistory("12345");
    expect(history.length).toBe(2);
    expect(history[1].content).toBe("second message");
  });
});

describe("bot: commands", () => {
  beforeAll(() => {
    db.init(":memory:");
  });

  test("/chatid replies with the chat ID", async () => {
    const { bot, replies } = makeBotWithMockedApi();
    await bot.handleUpdate(makeUpdate(99999, "/chatid"));
    expect(replies.some((r) => r.includes("99999"))).toBe(true);
  });

  test("/chatid does not call runAgent", async () => {
    const { bot, runAgent } = makeBotWithMockedApi();
    await bot.handleUpdate(makeUpdate(99999, "/chatid", 10));
    expect(runAgent).not.toHaveBeenCalled();
  });

  test("/ping sends the exact ping message text to runAgent", async () => {
    vi.useFakeTimers();
    const runAgent = vi.fn(async (_: RunPayload) => {});
    const { bot } = makeBotWithMockedApi({ runAgent });

    const p = bot.handleUpdate(makeUpdate(111, "/ping", 20));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;

    const call = runAgent.mock.calls[0][0] as RunPayload;
    expect(call.chatId).toBe("111");
    expect(call.message).toBe("this message is ping, please only reply `ping successful`");
    vi.useRealTimers();
  });

  test("/ping saves the ping message as a user message in db", async () => {
    vi.useFakeTimers();
    const { bot } = makeBotWithMockedApi();

    const p = bot.handleUpdate(makeUpdate(114, "/ping", 23));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;

    const history = db.getHistory("114");
    expect(history.some((m) => m.role === "user" && m.content.includes("ping"))).toBe(true);
    vi.useRealTimers();
  });

  test("/ping passes history from before the ping message to runAgent", async () => {
    vi.useFakeTimers();
    db.saveMessage("115", "user", "prior message");
    db.saveMessage("115", "assistant", "prior response");

    const runAgent = vi.fn(async (_: RunPayload) => {});
    const { bot } = makeBotWithMockedApi({ runAgent });

    const p = bot.handleUpdate(makeUpdate(115, "/ping", 24));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;

    const call = runAgent.mock.calls[0][0] as RunPayload;
    expect(call.history).toHaveLength(2);
    expect(call.history.some((m) => m.content.includes("ping"))).toBe(false);
    vi.useRealTimers();
  });

  test("/ping does nothing when agent replies within 10s", async () => {
    vi.useFakeTimers();
    const runAgent = vi.fn(async ({ chatId }: RunPayload) => {
      db.saveMessage(chatId, "assistant", "ping successful");
    });
    const { bot, replies } = makeBotWithMockedApi({ runAgent });

    const p = bot.handleUpdate(makeUpdate(112, "/ping", 21));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;

    expect(replies).toHaveLength(0);
    vi.useRealTimers();
  });

  test("/ping replies 'ping fails' when agent doesn't respond within 10s", async () => {
    vi.useFakeTimers();
    const runAgent = vi.fn(async () => {}); // agent never responds
    const { bot, replies } = makeBotWithMockedApi({ runAgent });

    const p = bot.handleUpdate(makeUpdate(113, "/ping", 22));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;

    expect(replies.some((r) => r.includes("ping fails"))).toBe(true);
    vi.useRealTimers();
  });

  test("/ping does not count pre-existing assistant messages as a reply", async () => {
    vi.useFakeTimers();

    // Insert old message at t=1000, then advance clock so sentAt will be strictly greater
    vi.setSystemTime(1000);
    db.saveMessage("116", "assistant", "old response from yesterday");
    vi.setSystemTime(2000); // ping is sent at t=2000 → created_at(1000) < sentAt(2000)

    const runAgent = vi.fn(async () => {}); // agent doesn't respond to the ping
    const { bot, replies } = makeBotWithMockedApi({ runAgent });

    const p = bot.handleUpdate(makeUpdate(116, "/ping", 25));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;

    // The pre-existing message must not satisfy the check — should still fail
    expect(replies.some((r) => r.includes("ping fails"))).toBe(true);
    vi.useRealTimers();
  });

  test("/clear calls clearHistory and restartAgent, replies with done", async () => {
    const clearHistory = vi.fn();
    const restartAgent = vi.fn(async () => {});
    const { bot, replies, runAgent } = makeBotWithMockedApi({ clearHistory, restartAgent });
    await bot.handleUpdate(makeUpdate(222, "/clear", 30));
    expect(clearHistory).toHaveBeenCalledWith("222");
    expect(restartAgent).toHaveBeenCalled();
    expect(replies.some((r) => r.includes("Done"))).toBe(true);
    expect(runAgent).not.toHaveBeenCalled();
  });

  test("/clear replies with failure message when restart fails", async () => {
    const clearHistory = vi.fn();
    const restartAgent = vi.fn(async () => {
      throw new Error("docker not found");
    });
    const { bot, replies } = makeBotWithMockedApi({ clearHistory, restartAgent });
    await bot.handleUpdate(makeUpdate(222, "/clear", 31));
    expect(clearHistory).toHaveBeenCalled();
    expect(replies.some((r) => r.includes("Agent restart failed"))).toBe(true);
  });

  test("/start replies with greeting", async () => {
    const { bot, replies } = makeBotWithMockedApi();
    await bot.handleUpdate(makeUpdate(333, "/start", 40));
    expect(replies.some((r) => r.includes("MinClaw"))).toBe(true);
  });

  test("unknown command replies with error message", async () => {
    const { bot, replies, runAgent } = makeBotWithMockedApi();
    await bot.handleUpdate(makeUpdate(444, "/foobar", 50));
    expect(replies.some((r) => r.includes("Unknown command /foobar"))).toBe(true);
    expect(runAgent).not.toHaveBeenCalled();
  });
});

describe("bot: allowlist", () => {
  beforeAll(() => {
    db.init(":memory:");
  });

  test("blocks messages from users not in allowlist", async () => {
    const { bot, replies, runAgent } = makeBotWithMockedApi();
    // Use a user ID NOT in the allowlist (TEST_USER_ID=99 is allowed)
    const update = {
      update_id: 60,
      message: {
        message_id: 60,
        chat: { id: 888, type: "private" as const, first_name: "Hacker" },
        from: { id: 777, is_bot: false as const, first_name: "Hacker", username: "hacker" },
        text: "should be blocked",
        date: Math.floor(Date.now() / 1000),
      },
    };
    await bot.handleUpdate(update);
    expect(replies).toHaveLength(0);
    expect(runAgent).not.toHaveBeenCalled();
  });

  test("blocks message when from field is missing (userId undefined)", async () => {
    const { bot, replies } = makeBotWithMockedApi();
    const update = {
      update_id: 61,
      message: {
        message_id: 61,
        chat: { id: 888, type: "private" as const, first_name: "Anon" },
        text: "no from field",
        date: Math.floor(Date.now() / 1000),
      },
    };
    await bot.handleUpdate(update);
    expect(replies).toHaveLength(0);
  });
});

describe("bot: proxy config", () => {
  test("creates bot with HTTPS_PROXY when env var is set", () => {
    process.env.HTTPS_PROXY = "http://proxy:8080";
    const bot = createBot(
      "fake-token",
      {
        saveMessage: vi.fn(),
        getHistory: vi.fn(() => []),
        dispatch: vi.fn(async () => {}),
        clearHistory: vi.fn(),
        restartAgent: vi.fn(async () => {}),
      },
      TEST_BOT_INFO,
    );
    expect(bot).toBeDefined();
    delete process.env.HTTPS_PROXY;
  });
});

describe("bot: allowlist callback query", () => {
  beforeAll(() => {
    db.init(":memory:");
  });

  test("blocked user with callback query data is logged", async () => {
    const { bot, replies } = makeBotWithMockedApi();
    const update = {
      update_id: 70,
      callback_query: {
        id: "cb1",
        chat_instance: "ci1",
        from: { id: 666, is_bot: false as const, first_name: "Blocked" },
        data: "some_callback",
      },
    };
    await bot.handleUpdate(update);
    expect(replies).toHaveLength(0);
  });
});

describe("bot: known command via text handler", () => {
  beforeAll(() => {
    db.init(":memory:");
  });

  test("known command in text handler does not generate unknown cmd reply", async () => {
    const { bot, replies, runAgent } = makeBotWithMockedApi();
    // /start is a known command — the text handler should return early
    // This is handled by the command handler, not the text handler.
    // The text handler's startsWith("/") branch catches unregistered commands only.
    await bot.handleUpdate(makeUpdate(555, "/start", 80));
    // /start is registered as a command handler, so text handler won't see it
    expect(replies.some((r) => r.includes("MinClaw"))).toBe(true);
    expect(runAgent).not.toHaveBeenCalled();
  });
});

describe("bot: allowlist file error handling", () => {
  test("handles missing allowlist file gracefully", () => {
    // Temporarily make readFileSync throw for the allowlist path
    const origImpl = (vi.mocked(fs.readFileSync) as ReturnType<typeof vi.fn>).getMockImplementation();
    vi.mocked(fs.readFileSync).mockImplementation(((p: string, ...args: unknown[]) => {
      if (path.resolve(p) === ALLOWLIST_PATH) throw new Error("ENOENT");
      return (origReadFileSync as Function).call(fs, p, ...args);
    }) as typeof fs.readFileSync);

    // Creating a bot with a missing file should not throw
    const bot = createBot(
      "fake-token",
      {
        saveMessage: vi.fn(),
        getHistory: vi.fn(() => []),
        dispatch: vi.fn(async () => {}),
        clearHistory: vi.fn(),
        restartAgent: vi.fn(async () => {}),
      },
      TEST_BOT_INFO,
    );
    expect(bot).toBeDefined();

    // Restore
    vi.mocked(fs.readFileSync).mockImplementation(origImpl!);
  });

  test("handles empty allowlist file", () => {
    const origImpl = (vi.mocked(fs.readFileSync) as ReturnType<typeof vi.fn>).getMockImplementation();
    vi.mocked(fs.readFileSync).mockImplementation(((p: string, ...args: unknown[]) => {
      if (path.resolve(p) === ALLOWLIST_PATH) return "\n\n";
      return (origReadFileSync as Function).call(fs, p, ...args);
    }) as typeof fs.readFileSync);

    const bot = createBot(
      "fake-token",
      {
        saveMessage: vi.fn(),
        getHistory: vi.fn(() => []),
        dispatch: vi.fn(async () => {}),
        clearHistory: vi.fn(),
        restartAgent: vi.fn(async () => {}),
      },
      TEST_BOT_INFO,
    );
    expect(bot).toBeDefined();

    vi.mocked(fs.readFileSync).mockImplementation(origImpl!);
  });
});
