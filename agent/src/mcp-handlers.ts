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

export class McpHandlers {
  constructor(
    private hostUrl: string,
    private chatId: string,
  ) {}

  private get(path: string) {
    return fetch(`${this.hostUrl}${path}`);
  }

  private post(path: string, body: unknown) {
    return fetch(`${this.hostUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async send_message({ text }: { text: string }): Promise<ToolResult> {
    log.info(`send_message chatId=${this.chatId} text="${text.slice(0, 80)}"`);
    const res = await this.post("/send", { chatId: this.chatId, text });
    const result = res.ok ? "sent" : `error: ${res.status}`;
    log.info(`send_message result=${result}`);
    return ok(result);
  }

  async schedule_job({
    cron,
    task,
    one_shot,
  }: {
    cron: string;
    task: string;
    one_shot?: boolean;
  }): Promise<ToolResult> {
    log.info(
      `schedule_job chatId=${this.chatId} cron="${cron}" one_shot=${!!one_shot} task="${task}"`,
    );
    const res = await this.post("/schedule", {
      chatId: this.chatId,
      cron,
      task,
      one_shot,
    });
    const data = (await res.json()) as { jobId?: number; error?: string };
    if (!res.ok) {
      const msg = data.error ?? `schedule failed: ${res.status}`;
      log.info(`schedule_job error=${msg}`);
      return ok(msg);
    }
    log.info(`schedule_job result=jobId#${data.jobId}`);
    return ok(`Scheduled job #${data.jobId}`);
  }

  async list_tasks(): Promise<ToolResult> {
    log.info(`list_tasks chatId=${this.chatId}`);
    const res = await this.get(`/jobs?chatId=${encodeURIComponent(this.chatId)}`);
    const jobs = (await res.json()) as Job[];
    if (!jobs.length) return ok("No scheduled tasks.");
    const lines = jobs.map((j) => {
      const next = new Date(j.next_run).toLocaleString();
      const type = j.one_shot ? "one-time" : "recurring";
      const task = j.task.length > 60 ? j.task.slice(0, 60) + "…" : j.task;
      return `- [#${j.id}] ${task} (${j.cron}, ${type}) — next: ${next}`;
    });
    return ok(`Scheduled tasks:\n${lines.join("\n")}`);
  }

  async cancel_task({ job_id }: { job_id: number }): Promise<ToolResult> {
    log.info(`cancel_task chatId=${this.chatId} job_id=${job_id}`);
    const res = await this.post("/cancel-job", {
      chatId: this.chatId,
      jobId: job_id,
    });
    const data = (await res.json()) as { cancelled: boolean };
    const msg = data.cancelled ? `Job #${job_id} cancelled.` : `Job #${job_id} not found.`;
    return ok(msg);
  }
}
