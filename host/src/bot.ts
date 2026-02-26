import { Bot } from 'grammy'
import * as db from './db'
import { run as agentRun } from './agent'

export function createBot(token: string): Bot {
  const bot = new Bot(token)

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const text = ctx.message.text

    db.saveMessage(chatId, 'user', text)
    const history = db.getHistory(chatId)

    // fire-and-forget — agent replies via host /send endpoint
    agentRun({ chatId, message: text, history }).catch(console.error)
  })

  return bot
}
