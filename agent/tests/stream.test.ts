import { describe, test, expect } from "vitest";

// Import the class by re-creating it (globalStream is a singleton)
// We'll test using the exported globalStream indirectly
// Actually, let's import from the module and test the MessageStream behavior

describe("MessageStream", () => {
  test("push and iterate yields items in order", async () => {
    // Dynamically import to get a fresh module instance isn't possible with singleton,
    // so let's test globalStream directly
    const { globalStream } = await import("../src/stream.js");

    const results: string[] = [];
    const payload = (msg: string) => ({
      chatId: "c1",
      message: msg,
      history: [] as { role: "user" | "assistant"; content: string }[],
      timestamp: "",
    });

    globalStream.push(payload("first"));
    globalStream.push(payload("second"));
    globalStream.end();

    for await (const item of globalStream) {
      results.push(item.message);
    }

    expect(results).toEqual(["first", "second"]);
  });
});
