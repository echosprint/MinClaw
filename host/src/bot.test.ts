import { describe, test, expect, beforeAll } from 'vitest'
import * as db from './db'
import { createBot } from './bot'

const TEST_BOT_INFO = {
  id: 1,
  is_bot: true as const,
  first_name: 'TestBot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
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

  function makeBotWithMockedApi() {
    const bot = createBot('fake-token', TEST_BOT_INFO)
    // intercept all API calls so no real HTTP requests are made in tests
    bot.api.config.use((_prev, _method, _payload, _signal) =>
      Promise.resolve({ ok: true, result: true } as any)
    )
    return bot
  }

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
