import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import { createServer } from '../src/server.js'
import { createHandlers } from '../src/mcp-handlers.js'
import { run } from '../src/runner.js'

// Mock the SDK — implementation is set per-test via mockImplementation
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
import { query } from '@anthropic-ai/claude-agent-sdk'

const AGENT_PORT = 4096
const HOST_PORT = 3096
const HOST_URL = `http://localhost:${HOST_PORT}`

// Capture calls the agent MCP tools make back to the host
type SentMessage = { chatId: string; text: string }
type ScheduledJob = { chatId: string; cron: string; task: string }
const sent: SentMessage[] = []
const scheduled: ScheduledJob[] = []
let jobIdSeq = 0

// Resolve when condition is met (avoids fixed-duration sleeps)
function waitFor(cond: () => boolean, timeout = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setInterval(() => { if (cond()) { clearInterval(t); resolve() } }, 10)
    setTimeout(() => { clearInterval(t); reject(new Error('waitFor timeout')) }, timeout)
  })
}

describe('agent integration', () => {
  let agentServer: http.Server
  let hostServer: http.Server

  beforeAll(() => new Promise<void>(resolve => {
    // Mock host — receives send_message and schedule_job HTTP calls from MCP handlers
    hostServer = http.createServer((req, res) => {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        const data = JSON.parse(body)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        if (req.url === '/send') {
          sent.push(data as SentMessage)
          res.end(JSON.stringify({ ok: true }))
        } else if (req.url === '/schedule') {
          scheduled.push(data as ScheduledJob)
          res.end(JSON.stringify({ jobId: ++jobIdSeq }))
        } else {
          res.writeHead(404).end()
        }
      })
    })
    hostServer.listen(HOST_PORT, () => {
      agentServer = createServer({ run }, AGENT_PORT)
      resolve()
    })
  }))

  afterAll(() => new Promise<void>(resolve => {
    agentServer.close()
    hostServer.close(() => resolve())
  }))

  beforeEach(() => {
    sent.length = 0
    scheduled.length = 0
    vi.mocked(query).mockClear()
  })

  // Helper: POST a Telegram message to the agent server
  function postMessage(chatId: string, message: string) {
    return fetch(`http://localhost:${AGENT_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message, history: [] }),
    })
  }

  // Helper: simulate agent calling MCP tools, extracted from the query call options
  function agentCallsTools(
    fn: (handlers: ReturnType<typeof createHandlers>, chatId: string) => Promise<void>
  ) {
    vi.mocked(query).mockImplementation(async function* (params: Parameters<typeof query>[0]) {
      const env = (params.options?.mcpServers as Record<string, { env?: Record<string, string> }>)
        ?.minclaw?.env ?? {}
      // Always point at the test host server; only chatId comes from runner options
      const handlers = createHandlers(HOST_URL, env.CHAT_ID ?? '')
      await fn(handlers, env.CHAT_ID ?? '')
    } as typeof query)
  }

  test('agent sends a text reply via send_message', async () => {
    agentCallsTools(async (h) => {
      await h.send_message({ text: 'Hello from agent!' })
    })

    const res = await postMessage('user-1', 'hi')
    expect(res.status).toBe(202) // server responds immediately

    await waitFor(() => sent.length > 0)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ chatId: 'user-1', text: 'Hello from agent!' })
  })

  test('agent schedules a cron job then confirms via send_message', async () => {
    agentCallsTools(async (h) => {
      await h.schedule_job({ cron: '0 9 * * *', task: 'Morning market summary' })
      await h.send_message({ text: 'Done! I will send a market summary every day at 9am.' })
    })

    await postMessage('user-2', 'remind me every morning at 9am with market summary')
    await waitFor(() => scheduled.length > 0 && sent.length > 0)

    expect(scheduled[0]).toMatchObject({
      chatId: 'user-2',
      cron: '0 9 * * *',
      task: 'Morning market summary',
    })
    expect(sent[0].text).toContain('9am')
  })

  test('agent uses browser then sends result via send_message', async () => {
    agentCallsTools(async (h) => {
      // Simulate: agent ran agent-browser to scrape price, then sent result
      await h.send_message({ text: 'BTC is currently $98,000.' })
    })

    await postMessage('user-3', 'What is the BTC price?')
    await waitFor(() => sent.length > 0)

    expect(sent[0]).toMatchObject({ chatId: 'user-3' })
    expect(sent[0].text).toContain('BTC')

    // Verify runner configured the agent-browser tool
    const opts = vi.mocked(query).mock.calls[0][0].options
    expect(opts?.allowedTools).toContain('Bash(agent-browser:*)')
  })

  test('each message carries the correct chatId through the full stack', async () => {
    agentCallsTools(async (h, chatId) => {
      await h.send_message({ text: `Reply to ${chatId}` })
    })

    await postMessage('alice-99', 'hello')
    await waitFor(() => sent.length > 0)

    expect(sent[0].chatId).toBe('alice-99')
    expect(sent[0].text).toBe('Reply to alice-99')
  })
})
