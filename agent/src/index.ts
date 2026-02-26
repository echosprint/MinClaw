import { createServer } from './server'
import { run } from './runner'

const PORT = Number(process.env.AGENT_PORT ?? 4000)

createServer({ run }, PORT)

console.log(`MinClaw agent running on :${PORT}`)
