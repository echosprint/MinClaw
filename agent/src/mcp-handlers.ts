export type ToolResult = { content: [{ type: 'text'; text: string }] }

export function createHandlers(hostUrl: string, chatId: string) {
  return {
    async send_message({ text }: { text: string }): Promise<ToolResult> {
      const res = await fetch(`${hostUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text }),
      })
      return { content: [{ type: 'text' as const, text: res.ok ? 'sent' : `error: ${res.status}` }] }
    },

    async schedule_job({ cron, task }: { cron: string; task: string }): Promise<ToolResult> {
      const res = await fetch(`${hostUrl}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, cron, task }),
      })
      const data = await res.json() as { jobId: number }
      return { content: [{ type: 'text' as const, text: `Scheduled job #${data.jobId}` }] }
    },
  }
}
