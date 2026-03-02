import { describe, test, expect, vi } from "vitest";
import { log } from "../src/log";

describe("log", () => {
  test("info writes to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("test info message");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  test("error writes to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("test error message");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  test("agent writes to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.agent("info", "agent message");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  test("agent with error level includes ERROR tag", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.agent("error", "agent error");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[ERROR]");
    spy.mockRestore();
  });
});
