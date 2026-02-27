const HOST_URL = process.env.HOST_URL ?? "http://host.docker.internal:13821";

function sendToHost(level: string, msg: string): void {
  fetch(`${HOST_URL}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, msg }),
  }).catch(() => {}); // fire-and-forget, silent on failure
}

export const log = {
  info(msg: string): void {
    console.log(`[agt][INFO] ${msg}`);
    sendToHost("info", msg);
  },
  error(msg: string): void {
    console.error(`[agt][ERROR] ${msg}`);
    sendToHost("error", msg);
  },
};
