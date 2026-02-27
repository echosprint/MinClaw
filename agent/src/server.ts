import http from "http";
import type { RunPayload } from "./runner.js";
import { log } from "./log.js";

export interface AgentServerDeps {
  run: (payload: RunPayload) => Promise<void>;
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

export function createServer(deps: AgentServerDeps, port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const route = `${req.method} ${req.url}`;

      if (route === "GET /health") {
        const claude = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
        respond(res, 200, { ok: true, claude });
        return;
      }

      if (route === "POST /run") {
        const payload = (await readBody(req)) as RunPayload;
        log.info(`request  chatId=${payload.chatId} message="${payload.message.slice(0, 80)}"`);
        // 202 immediately — agent works async
        respond(res, 202);
        deps.run(payload).catch((err) => log.error(`run failed chatId=${payload.chatId} ${err}`));
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
