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

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function run(payload: RunPayload): Promise<void> {
  await fetch(`${AGENT_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, timezone: TIMEZONE, timestamp: new Date().toISOString() }),
  });
}

export async function health(): Promise<{ agentOk: boolean; claudeOk: boolean }> {
  try {
    const res = await fetch(`${AGENT_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = (await res.json()) as { ok: boolean; claude: boolean };
    return { agentOk: data.ok === true, claudeOk: data.claude === true };
  } catch {
    return { agentOk: false, claudeOk: false };
  }
}

export async function restartAgent(): Promise<void> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  await promisify(execFile)("docker", ["compose", "restart", "agent"], {
    cwd: process.cwd(),
  });
}
