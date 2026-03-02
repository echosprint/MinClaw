import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/mcp-server.ts", "src/gmail-mcp-server.ts"],
    },
  },
});
