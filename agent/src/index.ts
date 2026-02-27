import { createServer } from "./server.js";
import { enqueue } from "./runner.js";
import { log } from "./log.js";

const PORT = Number(process.env.AGENT_PORT ?? 14827);

createServer({ enqueue }, PORT);

log.info(`MinClaw agent running on :${PORT}`);
