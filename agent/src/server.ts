import http from "http";
import type { RunPayload } from "./runner.js";
import { log } from "./log.js";

export interface AgentServerDeps {
  enqueue: (payload: RunPayload) => void;
}

function respond(res: http.ServerResponse, status: number, data?: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(data !== undefined ? JSON.stringify(data) : "");
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/*
 * Agent container's inbound HTTP server.
 * The host POSTs incoming chat messages here for async processing.
 * Routes:
 *   GET  /health  — liveness probe; also reports whether Claude auth token is present
 *   POST /run     — receive a chat message and enqueue it for async agent processing
 */
export function createServer(deps: AgentServerDeps, port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const route = `${req.method} ${req.url}`;

      if (route === "GET /health") {
        // CLAUDE_CODE_OAUTH_TOKEN must be set for the agent to authenticate with Claude.
        // The host checks this to detect misconfiguration early.
        const claude = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
        respond(res, 200, { ok: true, claude });
        return;
      }

      if (route === "POST /run") {
        const payload = (await readBody(req)) as RunPayload;
        log.info(
          `request  chatId=${payload.chatId} ts=${payload.timestamp} message="${payload.message.slice(0, 80)}"`,
        );
        // Respond 202 immediately so the host isn't blocked waiting.
        // The agent processes the message asynchronously via the queue;
        // replies reach the user through mcp__minclaw__send_message → host /send.
        respond(res, 202);
        deps.enqueue(payload);
        return;
      }

      log.error(`unknown route ${route}`);
      respond(res, 404);
    } catch (e) {
      log.error(`server error ${e}`);
      respond(res, 500, { error: String(e) });
    }
  });

  server.listen(port);
  return server;
}
