/*
 * Scheduler — the heartbeat of the assistant.
 * Every 10 seconds, tick() queries for due jobs and dispatches each as an
 * alert to the agent. One-shot jobs are deactivated after firing; recurring
 * jobs have their next_run advanced to the following cron occurrence.
 */
import { parseExpression } from "cron-parser";
import type { Job } from "./db";
import type { RunPayload } from "./agent";

// Heartbeat rate (ms).
const TICK_INTERVAL_MS = 10_000;

export interface SchedulerDeps {
  getDueJobs: () => Job[];
  advanceJob: (id: number, nextRun: number) => void;
  deactivateJob: (id: number) => void;
  dispatch: (payload: RunPayload) => Promise<void>;
}

export async function tick(deps: SchedulerDeps): Promise<void> {
  const jobs = deps.getDueJobs();
  for (const job of jobs) {
    // alert:true tells the agent this is a scheduled trigger, not a user message.
    await deps.dispatch({ chatId: job.chat_id, message: job.task, history: [], alert: true });

    if (job.one_shot) {
      deps.deactivateJob(job.id);
    } else {
      const next = parseExpression(job.cron).next().toDate().getTime();
      deps.advanceJob(job.id, next);
    }
  }
}

// Starts the heartbeat. Returns the interval handle so the caller can stop it.
export function start(deps: SchedulerDeps): NodeJS.Timeout {
  return setInterval(() => tick(deps), TICK_INTERVAL_MS);
}
