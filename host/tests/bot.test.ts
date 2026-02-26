import { describe, test, expect, beforeAll } from 'vitest'
import * as db from '../src/db'
import { createBot } from '../src/bot'

const TEST_BOT_INFO = {
  id: 1,
  is_bot: true as const,
  first_name: 'TestBot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
}

function makeBotWithMockedApi() {
  const bot = createBot('fake-token', TEST_BOT_INFO)
  bot.api.config.use((_prev, _method, _payload, _signal) =>
    Promise.resolve({ ok: true, result: true } as any)
  )
  return bot
}

function makeUpdate(chatId: number, text: string, updateId = 1) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: chatId, type: 'private' as const, first_name: 'User' },
      from: { id: 99, is_bot: false as const, first_name: 'User' },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  }
}

describe('bot: message handling', () => {
  beforeAll(() => {
    db.init(':memory:')
  })

  test('saves user message to db on incoming text', async () => {
    const bot = makeBotWithMockedApi()
    await bot.handleUpdate(makeUpdate(12345, 'hello bot'))

    const history = db.getHistory('12345')
    expect(history.length).toBe(1)
    expect(history[0].role).toBe('user')
    expect(history[0].content).toBe('hello bot')
  })

  test('history accumulates across multiple messages', async () => {
    const bot = makeBotWithMockedApi()
    await bot.handleUpdate(makeUpdate(12345, 'second message', 2))

    const history = db.getHistory('12345')
    expect(history.length).toBe(2)
    expect(history[1].content).toBe('second message')
  })
})
