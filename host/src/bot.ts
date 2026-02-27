import { Bot } from 'grammy'
import type { UserFromGetMe } from '@grammyjs/types'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { RunPayload } from './agent'
import type { Message } from './db'
import { log } from './log'

export interface BotDeps {
  saveMessage: (chatId: string, role: 'user' | 'assistant', content: string) => void
  getHistory: (chatId: string) => Message[]
  runAgent: (payload: RunPayload) => Promise<void>
}

export function createBot(token: string, deps: BotDeps, botInfo?: UserFromGetMe): Bot {
  const proxy = process.env.HTTPS_PROXY
  const botConfig = proxy
    ? { client: { baseFetchConfig: { agent: new HttpsProxyAgent(proxy) } } }
    : {}
  const bot = new Bot(token, { ...botConfig, ...(botInfo ? { botInfo } : {}) })

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const text = ctx.message.text

    log.info(`bot recv   chatId=${chatId} text="${text.slice(0, 80)}"`)

    deps.saveMessage(chatId, 'user', text)

    const history = deps.getHistory(chatId)
      .slice(0, -1) // exclude the message we just saved
      .map(m => ({ role: m.role, content: m.content }))

    await deps.runAgent({ chatId, message: text, history })
  })

  return bot
}
