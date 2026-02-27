import http from 'http'
import { parseExpression } from 'cron-parser'
import type { Role } from './db'
import { log } from './log'

export interface ServerDeps {
  sendToTelegram: (chatId: string, text: string) => Promise<void>
  saveMessage: (chatId: string, role: Role, content: string) => void
  saveJob: (chatId: string, cron: string, task: string, nextRun: number, oneShot?: boolean) => number
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

      if (route === 'GET /health') {
        respond(res, 200, { ok: true })
        return
      }

      if (route === 'POST /send') {
        log.info(`send       chatId=${body.chatId} text="${body.text.slice(0, 80)}"`)
        await deps.sendToTelegram(body.chatId, body.text)
        deps.saveMessage(body.chatId, 'assistant', body.text)
        respond(res, 200)
        return
      }

      if (route === 'POST /schedule') {
        try {
          const nextRun = parseExpression(body.cron).next().toDate().getTime()
          const oneShot = body.one_shot === 'true'
          const jobId = deps.saveJob(body.chatId, body.cron, body.task, nextRun, oneShot)
          log.info(`schedule   chatId=${body.chatId} cron="${body.cron}" one_shot=${oneShot} jobId=${jobId}`)
          respond(res, 200, { jobId })
        } catch {
          log.error(`schedule   invalid cron "${body.cron}"`)
          respond(res, 400, { error: 'Invalid cron expression' })
        }
        return
      }

      log.error(`unknown route ${route}`)
      respond(res, 404)
    } catch (e) {
      log.error(`server error ${e}`)
      respond(res, 500, { error: String(e) })
    }
  })

  server.listen(port)
  return server
}
