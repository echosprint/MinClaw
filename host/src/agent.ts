export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface RunPayload {
  chatId: string;
  message: string;
  history: Message[];
}

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:14827";

export async function run(payload: RunPayload): Promise<void> {
  await fetch(`${AGENT_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
