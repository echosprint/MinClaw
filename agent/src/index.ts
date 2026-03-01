/*
 * Agent entrypoint. Boot sequence:
 * 1. waitForHost  — poll host /health until reachable (host may start after agent)
 * 2. getTZ        — fetch timezone from host so scheduled jobs use local time
 * 3. createServer — start HTTP server, accepts /enqueue payloads from host
 * 4. startAgent   — begin draining the message queue (runs forever)
 */
import { createServer } from "./server.js";
import { enqueue, startAgent } from "./runner.js";
import { getTZ } from "./tz.js";
import { log } from "./log.js";

const PORT = Number(process.env.AGENT_PORT ?? 14827);
const HOST_URL = process.env.HOST_URL ?? "http://host.docker.internal:13821";

async function waitForHost(): Promise<void> {
  while (true) {
    try {
      const res = await fetch(`${HOST_URL}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}

await waitForHost();
await getTZ();

createServer({ enqueue }, PORT);
startAgent();

log.info(`MinClaw agent running on :${PORT}`);
log.info("---------------------------");
