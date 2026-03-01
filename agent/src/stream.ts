/*
 * Single-consumer async FIFO queue (like Go's chan or Rust's mpsc).
 * HTTP server pushes payloads; runner.ts drains them one at a time via
 * `for await`, serialising agent runs to one active Claude session.
 * Empty queue suspends the iterator by parking a Promise resolver in
 * `waiting`; push() resolves it to wake the consumer.
 */
import type { RunPayload } from "./runner.js";

class MessageStream {
  private queue: RunPayload[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(payload: RunPayload): void {
    this.queue.push(payload);
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<RunPayload> {
    while (true) {
      while (this.queue.length > 0) yield this.queue.shift()!;
      if (this.done) return;
      await new Promise<void>((r) => {
        this.waiting = r;
      });
      this.waiting = null;
    }
  }
}

export const globalStream = new MessageStream();
