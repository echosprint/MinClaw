import { log } from './log.js'

export type ToolResult = { content: [{ type: 'text'; text: string }] }

export function createHandlers(hostUrl: string, chatId: string) {
  return {
    async send_message({ text }: { text: string }): Promise<ToolResult> {
      log.info(`send_message chatId=${chatId} text="${text.slice(0, 80)}"`)
      const res = await fetch(`${hostUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text }),
      })
      const result = res.ok ? 'sent' : `error: ${res.status}`
      log.info(`send_message result=${result}`)
      return { content: [{ type: 'text' as const, text: result }] }
    },

    async schedule_job({ cron, task, one_shot }: { cron: string; task: string; one_shot?: boolean }): Promise<ToolResult> {
      log.info(`schedule_job chatId=${chatId} cron="${cron}" one_shot=${!!one_shot} task="${task}"`)
      const res = await fetch(`${hostUrl}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, cron, task, one_shot }),
      })
      const data = await res.json() as { jobId?: number; error?: string }
      if (!res.ok) {
        const msg = data.error ?? `schedule failed: ${res.status}`
        log.info(`schedule_job error=${msg}`)
        return { content: [{ type: 'text' as const, text: msg }] }
      }
      log.info(`schedule_job result=jobId#${data.jobId}`)
      return { content: [{ type: 'text' as const, text: `Scheduled job #${data.jobId}` }] }
    },

    async list_tasks(): Promise<ToolResult> {
      log.info(`list_tasks chatId=${chatId}`)
      const res = await fetch(`${hostUrl}/jobs?chatId=${encodeURIComponent(chatId)}`)
      const jobs = await res.json() as Array<{ id: number; cron: string; task: string; next_run: number; one_shot: number }>
      if (!jobs.length) return { content: [{ type: 'text' as const, text: 'No scheduled tasks.' }] }
      const lines = jobs.map(j => {
        const next = new Date(j.next_run).toLocaleString()
        const type = j.one_shot ? 'one-time' : 'recurring'
        return `- [#${j.id}] ${j.task.slice(0, 60)}${j.task.length > 60 ? '…' : ''} (${j.cron}, ${type}) — next: ${next}`
      })
      return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${lines.join('\n')}` }] }
    },

    async cancel_task({ job_id }: { job_id: number }): Promise<ToolResult> {
      log.info(`cancel_task chatId=${chatId} job_id=${job_id}`)
      const res = await fetch(`${hostUrl}/cancel-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, jobId: job_id }),
      })
      const data = await res.json() as { cancelled: boolean }
      const text = data.cancelled ? `Job #${job_id} cancelled.` : `Job #${job_id} not found.`
      return { content: [{ type: 'text' as const, text }] }
    },
  }
}
