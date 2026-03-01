/*
 * Host HTTP server — serves requests from the agent container.
 * Routes: /health, /timezone, /log, /send, /schedule, /history, /jobs, /cancel-job.
 * All state mutations go through injected deps (db + bot) for testability.
 */
import http from "http";
import { parseExpression } from "cron-parser";
import type { Job, Role } from "./db";
import { log } from "./log";

export interface ServerDeps {
  sendToTelegram: (chatId: string, text: string) => Promise<void>;
  saveMessage: (chatId: string, role: Role, content: string) => void;
  addJob: (
    chatId: string,
    cron: string,
    task: string,
    nextRun: number,
    oneShot?: boolean,
  ) => number;
  getActiveJobs: (chatId: string) => Job[];
  cancelJob: (id: number, chatId: string) => boolean;
  getHistory: (chatId: string, limit?: number) => { role: string; content: string }[];
}

// Send a JSON response; omits body for status-only replies (e.g. 200).
function respond(res: http.ServerResponse, status: number, data?: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(data !== undefined ? JSON.stringify(data) : "");
}

// Buffer the full request body and parse as JSON. Empty body defaults to {}.
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

export function createServer(deps: ServerDeps, port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const body = (await readBody(req)) as Record<string, string>;
      const url = new URL(req.url!, "http://localhost");
      const route = `${req.method} ${url.pathname}`;

      // Liveness probe — used by the agent to wait for host readiness on startup.
      if (route === "GET /health") {
        respond(res, 200, { ok: true });
        return;
      }

      // Returns the host's local timezone so the agent can display local time to the user.
      if (route === "GET /timezone") {
        respond(res, 200, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        return;
      }

      // Agent cannot write files; it forwards log lines here for the host to write.
      if (route === "POST /log") {
        log.agent(body.level ?? "info", body.msg ?? "");
        respond(res, 200);
        return;
      }

      // The only way the agent can reach the user — it has no Telegram credentials.
      // Delivers via Grammy and saves to history so future sessions have context.
      if (route === "POST /send") {
        log.info(`send   chatId=${body.chatId} text="${body.text.slice(0, 80)}"`);
        await deps.sendToTelegram(body.chatId, body.text);
        deps.saveMessage(body.chatId, "assistant", body.text);
        respond(res, 200);
        return;
      }

      // Validate the cron expression, compute next_run, and persist the job.
      if (route === "POST /schedule") {
        try {
          parseExpression(body.cron);
        } catch {
          const error = `Invalid cron: "${body.cron}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).`;
          log.error(`schedule   ${error}`);
          respond(res, 400, { error });
          return;
        }
        // Pre-compute next_run so the scheduler can compare it against the
        // current time with a simple integer check instead of parsing the cron.
        const nextRun = parseExpression(body.cron).next().toDate().getTime();
        // one_shot jobs are deactivated (active=0) after firing once; recurring jobs repeat.
        const oneShot = Boolean(body.one_shot);
        const jobId = deps.addJob(body.chatId, body.cron, body.task, nextRun, oneShot);
        log.info(
          `schedule   chatId=${body.chatId} cron="${body.cron}" one_shot=${oneShot} jobId=${jobId}`,
        );
        respond(res, 200, { jobId });
        return;
      }

      // Return recent messages for this chat (used by the agent to build context).
      if (route === "GET /history") {
        const chatId = url.searchParams.get("chatId") ?? "";
        const limit = Number(url.searchParams.get("limit") ?? 20);
        respond(res, 200, deps.getHistory(chatId, limit));
        return;
      }

      // List active scheduled jobs for this chat.
      if (route === "GET /jobs") {
        const chatId = new URL(req.url!, "http://localhost").searchParams.get("chatId") ?? "";
        const jobs = deps.getActiveJobs(chatId);
        respond(res, 200, jobs);
        return;
      }

      // Deactivate a scheduled job by ID.
      if (route === "POST /cancel-job") {
        const cancelled = deps.cancelJob(Number(body.jobId), body.chatId);
        respond(res, 200, { cancelled });
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
