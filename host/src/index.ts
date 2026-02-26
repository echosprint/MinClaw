import { Bot } from 'grammy'
import * as db from './db'
import { createBot } from './bot'
import { createServer } from './server'
import { start as startScheduler } from './scheduler'
import { run as agentRun } from './agent'

const HOST_PORT = Number(process.env.HOST_PORT ?? 3000)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is required')
  process.exit(1)
}

// 1. Init SQLite
db.init()

// 2. HTTP server — receives callbacks from agent container
let bot: Bot
const server = createServer(
  {
    sendToTelegram: (chatId, text) => bot.api.sendMessage(chatId, text),
    saveMessage: db.saveMessage.bind(db),
    saveJob: db.saveJob.bind(db),
  },
  HOST_PORT
)

// 3. Telegram bot
bot = createBot(BOT_TOKEN)
bot.start()

// 4. Scheduler — fires due jobs every minute
startScheduler({
  getDueJobs: db.getDueJobs.bind(db),
  advanceJob: db.advanceJob.bind(db),
  runAgent: agentRun,
})

console.log(`MinClaw host running on :${HOST_PORT}`)
