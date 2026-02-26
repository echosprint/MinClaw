import http from 'http'
import { parseExpression } from 'cron-parser'
import type { Role } from './db'

export interface ServerDeps {
  sendToTelegram: (chatId: string, text: string) => Promise<void>
  saveMessage: (chatId: string, role: Role, content: string) => void
  saveJob: (chatId: string, cron: string, task: string, nextRun: number) => number
}

function respond(res: http.ServerResponse, status: number, data?: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(data !== undefined ? JSON.stringify(data) : '')
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

export function createServer(deps: ServerDeps, port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req) as Record<string, string>
      const route = `${req.method} ${req.url}`

      if (route === 'POST /send') {
        await deps.sendToTelegram(body.chatId, body.text)
        deps.saveMessage(body.chatId, 'assistant', body.text)
        respond(res, 200)
        return
      }

      if (route === 'POST /schedule') {
        try {
          const nextRun = parseExpression(body.cron).next().toDate().getTime()
          const jobId = deps.saveJob(body.chatId, body.cron, body.task, nextRun)
          respond(res, 200, { jobId })
        } catch {
          respond(res, 400, { error: 'Invalid cron expression' })
        }
        return
      }

      respond(res, 404)
    } catch (e) {
      respond(res, 500, { error: String(e) })
    }
  })

  server.listen(port)
  return server
}
