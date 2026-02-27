import fs from 'fs'
import path from 'path'

const LOG_DIR = '/app/log'
const LOG_FILE = path.join(LOG_DIR, 'agent.log')
const canWrite = fs.existsSync(LOG_DIR)

function ts(): string {
  return new Date().toTimeString().slice(0, 8)
}

function write(line: string): void {
  if (canWrite) fs.appendFileSync(LOG_FILE, line + '\n')
}

export const log = {
  info(msg: string): void {
    const line = `[${ts()}][INFO] ${msg}`
    console.log(line)
    write(line)
  },
  error(msg: string): void {
    const line = `[${ts()}][ERROR] ${msg}`
    console.error(line)
    write(line)
  },
}
