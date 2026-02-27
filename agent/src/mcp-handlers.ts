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

    async schedule_job({ cron, task }: { cron: string; task: string }): Promise<ToolResult> {
      log.info(`schedule_job chatId=${chatId} cron="${cron}" task="${task}"`)
      const res = await fetch(`${hostUrl}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, cron, task }),
      })
      const data = await res.json() as { jobId: number }
      log.info(`schedule_job result=jobId#${data.jobId}`)
      return { content: [{ type: 'text' as const, text: `Scheduled job #${data.jobId}` }] }
    },
  }
}
