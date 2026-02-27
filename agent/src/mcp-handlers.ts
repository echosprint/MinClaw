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
  }
}
