/*
 * Unbounded async channel (like Go's chan or Rust's mpsc).
 * push() enqueues; `for await` drains one at a time.
 */
import type { RunPayload } from "./runner.js";

function createChannel<T>() {
  const buf: T[] = [];
  let wake: (() => void) | null = null;

  return {
    push(item: T) {
      buf.push(item);
      wake?.(); // wake the consumer if it's sleeping
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      while (true) {
        while (buf.length) yield buf.shift()!; // drain all buffered items
        await new Promise<void>((r) => (wake = r)); // sleep until push() wakes us
        wake = null; // clean up — we're awake, will re-park if buffer empties again
      }
    },
  };
}

export const globalStream = createChannel<RunPayload>();
