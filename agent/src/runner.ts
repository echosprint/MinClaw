import { query } from '@anthropic-ai/claude-agent-sdk'
import path from 'path'
import { fileURLToPath } from 'url'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface RunPayload {
  chatId: string
  message: string
  history: Message[]
}

const HOST_URL = process.env.HOST_URL ?? 'http://host.docker.internal:3000'

export async function run(payload: RunPayload): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const mcpServerPath = path.join(__dirname, 'mcp-server.js')

  const context = payload.history
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const prompt = context
    ? `${context}\n\nUser: ${payload.message}`
    : payload.message

  // .claude/CLAUDE.md is auto-loaded as project context (persona + communication rules)
  // .claude/skills/agent-browser is loaded as a plugin (agent-browser skill)
  const clauDir = path.join(__dirname, '..', '.claude')

  for await (const _msg of query({
    prompt,
    options: {
      cwd: path.join(clauDir, '..'),
      plugins: [{ type: 'local', path: path.join(clauDir, 'skills', 'agent-browser') }],
      allowedTools: [
        'WebSearch',
        'WebFetch',
        'Bash(agent-browser:*)',
        'mcp__minclaw__send_message',
        'mcp__minclaw__schedule_job',
      ],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        minclaw: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            CHAT_ID: payload.chatId,
            HOST_URL,
          },
        },
      },
    },
  })) {
    // agent communicates to user exclusively via MCP send_message tool
  }
}
