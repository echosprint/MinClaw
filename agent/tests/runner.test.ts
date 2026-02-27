import { describe, test, expect, vi, beforeEach } from "vitest";
import type { McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(() => (async function* () {})()),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { enqueue } from "../src/runner.js";

const mockQuery = vi.mocked(query);
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const basePayload = { timestamp: new Date().toISOString() };

describe("runner", () => {
  beforeEach(() => {
    mockQuery.mockClear();
  });

  describe("agent-browser tool", () => {
    test("allows Bash (agent-browser skill scopes it when invoked)", async () => {
      enqueue({ ...basePayload, chatId: "c1", message: "browse google.com", history: [] });
      await flush();
      const { allowedTools } = mockQuery.mock.calls[0][0].options!;
      expect(allowedTools).toContain("Bash");
    });

    test("loads agent-browser skill as a plugin", async () => {
      enqueue({ ...basePayload, chatId: "c1", message: "browse", history: [] });
      await flush();
      const { plugins } = mockQuery.mock.calls[0][0].options!;
      expect(plugins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "local",
            path: expect.stringContaining("agent-browser"),
          }),
        ]),
      );
    });
  });

  describe("send_message tool", () => {
    test("allows mcp__minclaw__send_message", async () => {
      enqueue({ ...basePayload, chatId: "c1", message: "hi", history: [] });
      await flush();
      const { allowedTools } = mockQuery.mock.calls[0][0].options!;
      expect(allowedTools).toContain("mcp__minclaw__send_message");
    });

    test("configures minclaw MCP server with chatId env", async () => {
      enqueue({ ...basePayload, chatId: "user-99", message: "hi", history: [] });
      await flush();
      const { mcpServers } = mockQuery.mock.calls[0][0].options!;
      const minclaw = mcpServers?.minclaw as McpStdioServerConfig | undefined;
      expect(minclaw?.env?.CHAT_ID).toBe("user-99");
    });
  });

  describe("schedule_job tool", () => {
    test("allows mcp__minclaw__schedule_job", async () => {
      enqueue({ ...basePayload, chatId: "c1", message: "remind me daily", history: [] });
      await flush();
      const { allowedTools } = mockQuery.mock.calls[0][0].options!;
      expect(allowedTools).toContain("mcp__minclaw__schedule_job");
    });
  });

  describe("prompt building", () => {
    test("passes plain message when no history", async () => {
      enqueue({ ...basePayload, chatId: "c1", message: "standalone", history: [] });
      await flush();
      expect(mockQuery.mock.calls[0][0].prompt).toContain("standalone");
    });

    test("prepends formatted history before the new message", async () => {
      enqueue({
        ...basePayload,
        chatId: "c1",
        message: "what next?",
        history: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi there" },
        ],
      });
      await flush();
      const { prompt } = mockQuery.mock.calls[0][0];
      expect(prompt).toContain("User: hello");
      expect(prompt).toContain("Assistant: hi there");
      expect(prompt).toContain("what next?");
    });
  });
});
