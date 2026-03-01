/*
 * Host entrypoint. Boot sequence:
 * 1. db.init()       — open SQLite, create tables if needed
 * 2. createServer()  — HTTP server for agent callbacks (/send, /schedule, /log, etc.)
 * 3. createBot()     — Grammy Telegram bot, start long-polling
 * 4. startScheduler  — poll due cron jobs every 60 s and dispatch to agent
 */
import { Bot } from "grammy";
import * as db from "./db";
import { createBot } from "./bot";
import { createServer } from "./server";
import { start as startScheduler } from "./scheduler";
import { dispatch, restartAgent as agentRestartAgent } from "./agent";
import { log } from "./log";
import { mdToHtml } from "./markdown";

const HOST_PORT = Number(process.env.HOST_PORT ?? 13821);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

// 1. Init SQLite
db.init();

// 2. HTTP server — receives callbacks from agent container
let bot: Bot;
createServer(
  {
    sendToTelegram: async (chatId, text) => {
      await bot.api.sendMessage(chatId, mdToHtml(text), { parse_mode: "HTML" });
    },
    saveMessage: db.saveMessage,
    addJob: db.addJob,
    getActiveJobs: db.getActiveJobs,
    cancelJob: db.cancelJob,
    getHistory: db.getHistory,
  },
  HOST_PORT,
);

// 3. Telegram bot
bot = createBot(BOT_TOKEN, {
  saveMessage: db.saveMessage,
  getHistory: db.getHistory,
  dispatch,
  clearHistory: db.clearHistory,
  restartAgent: agentRestartAgent,
});
bot.catch((err) => console.error("[bot] error:", err));
bot
  .start({
    onStart: (info) => console.log(`[bot] polling started @${info.username}`),
  })
  .catch((err) => {
    console.error("[bot] failed to start:", err);
    process.exit(1);
  });

// 4. Scheduler — fires due jobs every minute
startScheduler({
  getDueJobs: db.getDueJobs,
  advanceJob: db.advanceJob,
  deactivateJob: db.deactivateJob,
  dispatch,
});

log.info("---------------------------");
log.info(`MinClaw host running on :${HOST_PORT}`);
