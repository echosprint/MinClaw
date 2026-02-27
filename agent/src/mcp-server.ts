import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createHandlers } from './mcp-handlers.js'

const CHAT_ID = process.env.CHAT_ID ?? ''
const HOST_URL = process.env.HOST_URL ?? 'http://host.docker.internal:13821'

const server = new McpServer({ name: 'minclaw', version: '1.0.0' })
const handlers = createHandlers(HOST_URL, CHAT_ID)

server.registerTool(
  'send_message',
  {
    description: 'Send a message to the user on Telegram',
    inputSchema: { text: z.string().describe('Message text to send') },
  },
  handlers.send_message
)

server.registerTool(
  'schedule_job',
  {
    description: 'Schedule a task using a cron expression. Use one_shot=true for one-time reminders.',
    inputSchema: {
      cron: z.string().describe('Cron expression e.g. "0 15 * * *"'),
      task: z.string().describe('Natural language task description'),
      one_shot: z.boolean().optional().describe('If true, runs once then deactivates'),
    },
  },
  handlers.schedule_job
)

const transport = new StdioServerTransport()
server.connect(transport).catch(console.error)
