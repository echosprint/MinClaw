import Anthropic from '@anthropic-ai/sdk'
import { search, searchTool } from './tools/search'
import { browser, browserTool } from './tools/browser'
import { sendMessage, sendMessageTool } from './tools/sendMessage'
import { scheduleJob, scheduleJobTool } from './tools/scheduleJob'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface RunPayload {
  chatId: string
  message: string
  history: Message[]
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOLS = [searchTool, browserTool, sendMessageTool, scheduleJobTool]

async function dispatch(
  name: string,
  input: Record<string, string>,
  chatId: string
): Promise<string> {
  try {
    switch (name) {
      case 'search':       return await search(input.query)
      case 'browser':      return browser(input.url)
      case 'send_message': return await sendMessage(chatId, input.text)
      case 'schedule_job': return await scheduleJob(chatId, input.cron, input.task)
      default:             return `Unknown tool: ${name}`
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function run(payload: RunPayload): Promise<void> {
  const messages: Anthropic.MessageParam[] = [
    ...payload.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: payload.message },
  ]

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      tools: TOOLS,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') break

    if (response.stop_reason === 'tool_use') {
      const results: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const result = await dispatch(
          block.name,
          block.input as Record<string, string>,
          payload.chatId
        )
        results.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      messages.push({ role: 'user', content: results })
    }
  }
}
