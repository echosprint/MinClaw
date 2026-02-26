import { createServer } from './server.js'
import { run } from './runner.js'

const PORT = Number(process.env.AGENT_PORT ?? 4000)

createServer({ run }, PORT)

console.log(`MinClaw agent running on :${PORT}`)
