import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const CHAT_ID = process.env.CHAT_ID ?? ''
const HOST_URL = process.env.HOST_URL ?? 'http://host.docker.internal:3000'

const server = new McpServer({ name: 'minclaw', version: '1.0.0' })

server.registerTool(
  'send_message',
  {
    description: 'Send a message to the user on Telegram',
    inputSchema: { text: z.string().describe('Message text to send') },
  },
  async ({ text }) => {
    const res = await fetch(`${HOST_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: CHAT_ID, text }),
    })
    return { content: [{ type: 'text' as const, text: res.ok ? 'sent' : `error: ${res.status}` }] }
  }
)

server.registerTool(
  'schedule_job',
  {
    description: 'Schedule a recurring task using a cron expression',
    inputSchema: {
      cron: z.string().describe('Cron expression e.g. "0 15 * * *"'),
      task: z.string().describe('Natural language task description'),
    },
  },
  async ({ cron, task }) => {
    const res = await fetch(`${HOST_URL}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: CHAT_ID, cron, task }),
    })
    const data = await res.json() as { jobId: number }
    return { content: [{ type: 'text' as const, text: `Scheduled job #${data.jobId}` }] }
  }
)

const transport = new StdioServerTransport()
server.connect(transport).catch(console.error)
