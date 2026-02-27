import { createServer } from './server.js'
import { run } from './runner.js'
import { log } from './log.js'

const PORT = Number(process.env.AGENT_PORT ?? 4000)

createServer({ run }, PORT)

log.info(`MinClaw agent running on :${PORT}`)
