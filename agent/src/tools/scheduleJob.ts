const HOST_URL = process.env.HOST_URL ?? 'http://host.docker.internal:3000'

export async function scheduleJob(
  chatId: string,
  cron: string,
  task: string
): Promise<string> {
  const res = await fetch(`${HOST_URL}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, cron, task }),
  })
  if (!res.ok) throw new Error(`Host /schedule error: ${res.status}`)
  const data = await res.json() as { jobId: number }
  return `Scheduled job #${data.jobId}`
}

export const scheduleJobTool = {
  name: 'schedule_job',
  description: 'Schedule a recurring task using a cron expression',
  input_schema: {
    type: 'object' as const,
    properties: {
      cron: { type: 'string', description: 'Cron expression e.g. "0 15 * * *" for 3pm daily' },
      task: { type: 'string', description: 'Natural language description of the task to run' },
    },
    required: ['cron', 'task'],
  },
}
