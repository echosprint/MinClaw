import { parseExpression } from "cron-parser";
import type { Job } from "./db";
import type { RunPayload } from "./agent";

export interface SchedulerDeps {
  getDueJobs: () => Job[];
  advanceJob: (id: number, nextRun: number) => void;
  deactivateJob: (id: number) => void;
  runAgent: (payload: RunPayload) => Promise<void>;
}

// tick is exported so tests can call it directly without a real timer
export async function tick(deps: SchedulerDeps): Promise<void> {
  const jobs = deps.getDueJobs();
  for (const job of jobs) {
    await deps.runAgent({ chatId: job.chat_id, message: job.task, history: [], alert: true });
    if (job.one_shot) {
      deps.deactivateJob(job.id);
    } else {
      const next = parseExpression(job.cron).next().toDate().getTime();
      deps.advanceJob(job.id, next);
    }
  }
}

export function start(deps: SchedulerDeps): NodeJS.Timeout {
  return setInterval(() => tick(deps), 10_000);
}
