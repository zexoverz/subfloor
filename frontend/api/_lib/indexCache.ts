/// One upstream query per distinct request per window, however many callers ask.
///
/// Studio's development endpoint is rate-limited — "intended for testing purposes only", in The
/// Graph's own docs — and before this every open tab polled it every twenty seconds on its own while
/// the policy loop read it twice every thirty. The answer is not fewer tabs. It is one origin in
/// front of the index, which is also why the site and its API ship as one image in the first place.
///
/// Only a clean answer is kept. A failure, or a GraphQL error, is dropped the moment it lands, so
/// the next caller asks the index again rather than being handed the failure for the rest of the
/// window — and nothing here ever serves an answer past its window. A number a human is about to
/// sign must not come from a cache that outlived the index.

export interface IndexAnswer {
  status: number;
  body: string;
  retryAfter: string | null;
}

/// Thirty seconds: longer than the interface's twenty-second poll, so every open tab shares one read,
/// and short against anything these queries report — fills and reference rounds are minutes apart.
export const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 256;

interface Entry {
  at: number;
  answer: Promise<IndexAnswer>;
}

const entries = new Map<string, Entry>();

function isClean(a: IndexAnswer): boolean {
  if (a.status !== 200) return false;
  try {
    const parsed = JSON.parse(a.body) as { errors?: unknown[] };
    return !parsed.errors?.length;
  } catch {
    return false;
  }
}

export async function cachedPost(
  endpoint: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
  ttlMs: number = DEFAULT_TTL_MS,
  now: () => number = Date.now,
): Promise<IndexAnswer> {
  const key = `${endpoint}\n${body}`;
  const hit = entries.get(key);
  if (hit && now() - hit.at < ttlMs) return hit.answer;

  const answer = (async (): Promise<IndexAnswer> => {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    return { status: res.status, body: await res.text(), retryAfter: res.headers.get("retry-after") };
  })();

  entries.set(key, { at: now(), answer });
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }

  // Callers already waiting share this one request either way; what is decided here is only whether
  // the *next* caller does too. Guarded on identity so a slow failure cannot evict a newer answer.
  const drop = () => {
    if (entries.get(key)?.answer === answer) entries.delete(key);
  };
  answer.then((a) => (isClean(a) ? undefined : drop()), drop);

  return answer;
}

export function clearIndexCache(): void {
  entries.clear();
}
