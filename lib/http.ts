// Server-side fetch helper: browser-like headers, timeouts, a per-host
// concurrency limit and a small in-memory TTL cache so we stay polite to
// ratings.fide.com and chess-results.com.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT_MS = 30_000;
const MAX_PER_HOST = 3;
const CACHE_TTL_MS = 15 * 60 * 1000;
const RETRY_DELAYS_MS = [500, 1500];
const RETRYABLE = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
]);

type CacheEntry = { expires: number; value: Promise<unknown> };
const cache = new Map<string, CacheEntry>();

/** Memoize an async computation for CACHE_TTL_MS. Failed promises are evicted. */
export function cached<T>(key: string, fn: () => Promise<T>, ttl = CACHE_TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = fn();
  cache.set(key, { expires: Date.now() + ttl, value });
  value.catch(() => cache.delete(key));
  if (cache.size > 2000) {
    for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
  }
  return value;
}

// Simple per-host semaphore.
const active = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

async function acquire(host: string) {
  const n = active.get(host) ?? 0;
  if (n < MAX_PER_HOST) {
    active.set(host, n + 1);
    return;
  }
  await new Promise<void>((resolve) => {
    const q = waiting.get(host) ?? [];
    q.push(resolve);
    waiting.set(host, q);
  });
}

function release(host: string) {
  const next = waiting.get(host)?.shift();
  if (next) next();
  else active.set(host, (active.get(host) ?? 1) - 1);
}

export type FetchOptions = {
  method?: "GET" | "POST";
  form?: Record<string, string>;
  headers?: Record<string, string>;
  cookie?: string;
};

export type FetchResult = { text: string; cookies: string[]; status: number };

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const host = new URL(url).host;
  await acquire(host);
  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en",
      ...opts.headers,
    };
    if (opts.cookie) headers.Cookie = opts.cookie;
    let body: string | undefined;
    if (opts.form) {
      body = new URLSearchParams(opts.form).toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    let res: Response | undefined;
    for (let attempt = 0; !res; attempt++) {
      try {
        res = await fetch(url, {
          method: opts.method ?? (body ? "POST" : "GET"),
          headers,
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (e) {
        // Node reports network failures as a bare "fetch failed"; the useful part
        // (ECONNRESET, UND_ERR_CONNECT_TIMEOUT, ...) is in `cause`.
        const cause = (e as { cause?: { code?: string; message?: string } }).cause;
        const detail = cause?.code ?? cause?.message ?? (e as Error).message;
        // ratings.fide.com sometimes drops connections; retry those, but not our own timeout.
        if (cause?.code && RETRYABLE.has(cause.code) && attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        const { pathname } = new URL(url);
        throw new Error(`could not reach ${host}${pathname} (${detail})`);
      }
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} from ${host}`);
    return { text, cookies: res.headers.getSetCookie?.() ?? [], status: res.status };
  } finally {
    release(host);
  }
}

/** Turn Set-Cookie headers into a Cookie request header. */
export function cookieHeader(setCookies: string[]): string {
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}
