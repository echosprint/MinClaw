import { Bot, type Context } from "grammy";
import type { UserFromGetMe } from "@grammyjs/types";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { RunPayload } from "./agent";
import type { Message } from "./db";
import { log } from "./log";

export interface BotDeps {
  saveMessage: (chatId: string, role: "user" | "assistant", content: string) => void;
  getHistory: (chatId: string) => Message[];
  runAgent: (payload: RunPayload) => Promise<void>;
  clearHistory: (chatId: string) => void;
  restartAgent: () => Promise<void>;
}

type CommandHandler = (ctx: Context) => Promise<void>;

const COMMANDS: Record<string, CommandHandler> = {} as Record<string, CommandHandler>;

export function createBot(token: string, deps: BotDeps, botInfo?: UserFromGetMe): Bot {
  const proxy = process.env.HTTPS_PROXY;
  const botConfig = proxy
    ? { client: { baseFetchConfig: { agent: new HttpsProxyAgent(proxy) } } }
    : {};
  const bot = new Bot(token, { ...botConfig, ...(botInfo ? { botInfo } : {}) });

  COMMANDS.chatid = async (ctx) => {
    await ctx.reply(`Your chat ID: ${ctx.chat!.id}`);
  };

  COMMANDS.ping = async (ctx) => {
    const chatId = String(ctx.chat!.id);
    const pingMsg = "this message is ping, please only reply `ping successful`";

    const historyBefore = deps.getHistory(chatId).map((m) => ({ role: m.role, content: m.content }));
    const sentAt = Date.now();

    deps.saveMessage(chatId, "user", pingMsg);
    await deps.runAgent({ chatId, message: pingMsg, history: historyBefore });

    await new Promise((r) => setTimeout(r, 10_000));

    const historyAfter = deps.getHistory(chatId);
    const replied = historyAfter.some((m) => m.role === "assistant" && m.created_at >= sentAt);

    if (!replied) {
      await ctx.reply("ping fails");
    }
  };

  COMMANDS.clear = async (ctx) => {
    const chatId = String(ctx.chat!.id);
    await ctx.reply("Clearing history and restarting agent...");
    deps.clearHistory(chatId);
    try {
      await deps.restartAgent();
      await ctx.reply("Done. Fresh start!");
    } catch (err) {
      await ctx.reply(`History cleared. Agent restart failed: ${err}`);
    }
  };

  for (const [name, handler] of Object.entries(COMMANDS)) {
    bot.command(name, handler);
  }

  bot.on("message:text", async (ctx) => {
    const chatId = String(ctx.chat!.id);
    const text = ctx.message.text;

    if (text.startsWith("/")) {
      const cmd = text.slice(1).split(/[\s@]/)[0];
      if (!(cmd in COMMANDS)) {
        await ctx.reply(`Unknown command /${cmd}. Available: /${Object.keys(COMMANDS).join(", /")}`);
      }
      return;
    }

    log.info(`bot recv   chatId=${chatId} text="${text.slice(0, 80)}"`);

    deps.saveMessage(chatId, "user", text);

    const history = deps
      .getHistory(chatId)
      .slice(0, -1) // exclude the message we just saved
      .map((m) => ({ role: m.role, content: m.content }));

    await deps.runAgent({ chatId, message: text, history });
  });

  return bot;
}
