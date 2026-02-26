import { Bot, type User } from 'grammy'
import { HttpsProxyAgent } from 'https-proxy-agent'
import * as db from './db'

export function createBot(token: string, botInfo?: User): Bot {
  const proxy = process.env.HTTPS_PROXY
  const botConfig = proxy
    ? { client: { baseFetchConfig: { agent: new HttpsProxyAgent(proxy) } } }
    : {}
  const bot = new Bot(token, { ...botConfig, ...(botInfo ? { botInfo } : {}) })

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const text = ctx.message.text

    console.log(`[bot] received from ${chatId}: ${text}`)

    db.saveMessage(chatId, 'user', text)

    // placeholder — echo back until agent is connected
    await ctx.reply(text)
  })

  return bot
}
