/*
 * Host logger. Writes colorized output to stdout and appends plain text to
 * log/minclaw.log. The agent cannot write files directly — it calls POST /log
 * on the host, which forwards the message here under the [agt] prefix.
 */
import fs from "fs";
import path from "path";

const LOG_DIR = path.join(__dirname, "..", "..", "log");
const LOG_FILE = path.join(LOG_DIR, "minclaw.log");

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, "", { flag: "a" });

const C = {
  reset: "\x1b[0m",
  gray: "\x1b[90m", // dim timestamp
  bot: "\x1b[1;35m", // bold magenta — host bot
  agt: "\x1b[1;34m", // bold blue    — agent
  error: "\x1b[1;31m", // bold red     — errors
};

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function date(): string {
  return new Date().toLocaleDateString('en-CA');
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function oneline(s: string): string {
  return s.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

function write(line: string): void {
  const clean = line.replace(ANSI_RE, "");
  fs.appendFileSync(LOG_FILE, `[${date()}]${clean}\n`);
}

export const log = {
  info(msg: string): void {
    const safe = oneline(msg);
    const line = `${C.gray}[${ts()}]${C.reset} ${C.bot}[bot]${C.reset} ${safe}`;
    console.log(line);
    write(line);
  },
  error(msg: string): void {
    const safe = oneline(msg);
    const line = `${C.gray}[${ts()}]${C.reset} ${C.bot}[bot]${C.reset} ${C.error}[ERROR]${C.reset} ${safe}`;
    console.error(line);
    write(line);
  },
  agent(level: string, msg: string): void {
    const safe = oneline(msg);
    const errSuffix = level === "error" ? ` ${C.error}[ERROR]${C.reset}` : "";
    const line = `${C.gray}[${ts()}]${C.reset} ${C.agt}[agt]${C.reset}${errSuffix} ${safe}`;
    console.log(line);
    write(line);
  },
};
