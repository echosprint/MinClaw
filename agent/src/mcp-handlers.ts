import { log } from "./log.js";

export interface ToolResult {
  [key: string]: unknown;
  content: [{ type: "text"; text: string }];
}

interface Job {
  id: number;
  cron: string;
  task: string;
  next_run: number;
  one_shot: number;
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function createHandlers(hostUrl: string, chatId: string) {
  const get = (path: string) => fetch(`${hostUrl}${path}`);

  const post = (path: string, body: unknown) =>
    fetch(`${hostUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const send_message = async ({ text }: { text: string }): Promise<ToolResult> => {
    log.info(`send_message chatId=${chatId} text="${text.slice(0, 80)}"`);
    const res = await post("/send", { chatId, text });
    const result = res.ok ? "sent" : `error: ${res.status}`;
    log.info(`send_message result=${result}`);
    return ok(result);
  };

  const schedule_job = async ({
    cron,
    task,
    one_shot,
  }: {
    cron: string;
    task: string;
    one_shot?: boolean;
  }): Promise<ToolResult> => {
    log.info(`schedule_job chatId=${chatId} cron="${cron}" one_shot=${!!one_shot} task="${task}"`);
    const res = await post("/schedule", { chatId, cron, task, one_shot });
    const data = (await res.json()) as { jobId?: number; error?: string };
    if (!res.ok) {
      const msg = data.error ?? `schedule failed: ${res.status}`;
      log.info(`schedule_job error=${msg}`);
      return ok(msg);
    }
    log.info(`schedule_job result=jobId#${data.jobId}`);
    return ok(`Scheduled job #${data.jobId}`);
  };

  const list_tasks = async (): Promise<ToolResult> => {
    log.info(`list_tasks chatId=${chatId}`);
    const res = await get(`/jobs?chatId=${encodeURIComponent(chatId)}`);
    if (!res.ok) return ok(`list_tasks failed: ${res.status}`);
    const jobs = (await res.json()) as Job[];
    if (!jobs.length) return ok("No scheduled tasks.");
    const lines = jobs.map((j, i) => {
      const next = new Date(j.next_run).toLocaleString("en-US", { timeZone: process.env.TZ });
      const type = j.one_shot ? "one-time" : "recurring";
      const cp = [...j.task];
      const task = cp.length > 60 ? cp.slice(0, 60).join("") + "…" : j.task;
      return `- #${i + 1} ${task} (${j.cron}, ${type}) — next: ${next} [job_id:${j.id}]`;
    });
    return ok(`Scheduled tasks:\n${lines.join("\n")}`);
  };

  const cancel_task = async ({ job_id }: { job_id: number }): Promise<ToolResult> => {
    log.info(`cancel_task chatId=${chatId} job_id=${job_id}`);
    const res = await post("/cancel-job", { chatId, jobId: job_id });
    const data = (await res.json()) as { cancelled: boolean };
    const msg = data.cancelled ? `Job #${job_id} cancelled.` : `Job #${job_id} not found.`;
    return ok(msg);
  };

  const get_local_time = async (): Promise<ToolResult> => {
    const tz = process.env.TZ ?? "UTC";
    const time = new Date().toLocaleString("en-US", { timeZone: tz });
    return ok(`Current time: ${time} (${tz})`);
  };

  return { send_message, schedule_job, list_tasks, cancel_task, get_local_time };
}
