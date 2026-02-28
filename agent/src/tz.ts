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
