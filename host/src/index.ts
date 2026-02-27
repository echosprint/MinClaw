import { Bot } from "grammy";
import * as db from "./db";
import { createBot } from "./bot";
import { createServer } from "./server";
import { start as startScheduler } from "./scheduler";
import { run as agentRun, restartAgent as agentRestartAgent } from "./agent";
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
const server = createServer(
  {
    sendToTelegram: async (chatId, text) => {
      await bot.api.sendMessage(chatId, mdToHtml(text), { parse_mode: "HTML" });
    },
    saveMessage: db.saveMessage.bind(db),
    addJob: db.addJob.bind(db),
    getActiveJobs: db.getActiveJobs.bind(db),
    cancelJob: db.cancelJob.bind(db),
  },
  HOST_PORT,
);

// 3. Telegram bot
bot = createBot(BOT_TOKEN, {
  saveMessage: db.saveMessage.bind(db),
  getHistory: db.getHistory.bind(db),
  runAgent: agentRun,
  clearHistory: db.clearHistory.bind(db),
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
  getDueJobs: db.getDueJobs.bind(db),
  advanceJob: db.advanceJob.bind(db),
  deactivateJob: db.deactivateJob.bind(db),
  runAgent: agentRun,
});

log.info(`MinClaw host running on :${HOST_PORT}`);
