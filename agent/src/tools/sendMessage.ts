const HOST_URL = process.env.HOST_URL ?? 'http://host.docker.internal:3000'

export async function sendMessage(chatId: string, text: string): Promise<string> {
  const res = await fetch(`${HOST_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, text }),
  })
  if (!res.ok) throw new Error(`Host /send error: ${res.status}`)
  return 'sent'
}

export const sendMessageTool = {
  name: 'send_message',
  description: 'Send a message to the user on Telegram',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Message text to send' },
    },
    required: ['text'],
  },
}
