import fs from "fs";
import path from "path";

// host runs from MinClaw/host/, log dir is MinClaw/log/
const LOG_DIR = path.join(process.cwd(), "..", "log");
const LOG_FILE = path.join(LOG_DIR, "minclaw.log");
const canWrite = fs.existsSync(LOG_DIR);

const C = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",       // dim timestamp
  bot: "\x1b[1;35m",      // bold magenta — host bot
  agt: "\x1b[1;34m",      // bold blue    — agent
  error: "\x1b[1;31m",    // bold red     — errors
};

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function write(line: string): void {
  if (canWrite) fs.appendFileSync(LOG_FILE, line + "\n");
}

export const log = {
  info(msg: string): void {
    const line = `[${ts()}][bot][INFO] ${msg}`;
    console.log(`${C.gray}[${ts()}]${C.reset} ${C.bot}[bot]${C.reset} ${msg}`);
    write(line);
  },
  error(msg: string): void {
    const line = `[${ts()}][bot][ERROR] ${msg}`;
    console.error(`${C.gray}[${ts()}]${C.reset} ${C.bot}[bot]${C.reset} ${C.error}[ERROR]${C.reset} ${msg}`);
    write(line);
  },
  agent(level: string, msg: string): void {
    const line = `[${ts()}][agt][${level.toUpperCase()}] ${msg}`;
    const errSuffix = level === "error" ? ` ${C.error}[ERROR]${C.reset}` : "";
    console.log(`${C.gray}[${ts()}]${C.reset} ${C.agt}[agt]${C.reset}${errSuffix} ${msg}`);
    write(line);
  },
};
