/*
 * Lazily fetches the host's local timezone once and caches it.
 * Timezone lives on the host (not the container) since the host is
 * where the user's system clock runs. Falls back to UTC on failure.
 */
import { log } from "./log.js";
import { HOST_URL } from "./config.js";

function createTZFetcher() {
  let TZ: string | undefined;
  return async (): Promise<string> => {
    if (!TZ) {
      TZ = await fetch(`${HOST_URL}/timezone`)
        .then((r) => r.json() as Promise<{ timezone: string }>)
        .then((d) => d.timezone)
        .catch((err) => {
          log.error(`timezone fetch failed: ${err}`);
          return "UTC";
        });
    }
    return TZ;
  };
}

export const getTZ = createTZFetcher();
