import fs from 'fs'
import path from 'path'

// host runs from MinClaw/host/, log dir is MinClaw/log/
const LOG_DIR = path.join(process.cwd(), '..', 'log')
const LOG_FILE = path.join(LOG_DIR, 'minclaw.log')
const canWrite = fs.existsSync(LOG_DIR)

function ts(): string {
  return new Date().toTimeString().slice(0, 8)
}

function write(line: string): void {
  if (canWrite) fs.appendFileSync(LOG_FILE, line + '\n')
}

export const log = {
  info(msg: string): void {
    const line = `[${ts()}][bot][INFO] ${msg}`
    console.log(line)
    write(line)
  },
  error(msg: string): void {
    const line = `[${ts()}][bot][ERROR] ${msg}`
    console.error(line)
    write(line)
  },
}
