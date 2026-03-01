import path from "path";
import { fileURLToPath } from "url";

export const HOST_URL = process.env.HOST_URL ?? "http://host.docker.internal:13821";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const mcpServerPath = path.resolve(__dirname, "..", "dist", "mcp-server.js");
export const gmailMcpServerPath = path.resolve(__dirname, "..", "dist", "gmail-mcp-server.js");
export const claudeDir = path.join(__dirname, "..", ".claude");
