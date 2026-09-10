export const MIN_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One limiter instance holds per-host timing state. */
export function createHostLimiter(minIntervalMs: number = MIN_INTERVAL_MS) {
  const lastAt = new Map<string, number>();
  const chain = new Map<string, Promise<unknown>>();

  return async function limit<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const previous = chain.get(host) ?? Promise.resolve();
    const run = previous.then(async () => {
      const wait = Math.max(0, (lastAt.get(host) ?? 0) + minIntervalMs - Date.now());
      if (wait > 0) await sleep(wait);
      lastAt.set(host, Date.now());
      return fn();
    });
    chain.set(host, run.catch(() => undefined));
    return run;
  };
}

export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  if (!url.startsWith('https://')) {
    throw new Error(`Refusing non-https outbound request: ${url}`);
  }
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    lastStatus = res.status;
    if (attempt < attempts - 1) await sleep(baseDelayMs * 2 ** attempt);
  }
  throw new Error(`Gave up after ${attempts} attempts, last status ${lastStatus}: ${url}`);
}
