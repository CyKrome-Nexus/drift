// Several keys for one provider: the same provider once per key, tried in turn.
//
// A key that is refused (bad, revoked) or spent (rate limited) hands the request to the next key;
// the chain then stays on the key that worked, so a healthy key is not retried behind a spent one
// on every request. Anything else (offline, a provider outage) is not a key problem and is thrown
// as it is.

import { ProviderError, type WallpaperProvider } from './types';

/** Statuses that say "this key", not "this request": bad key (Pixabay answers 400), refused, spent. */
const KEY_PROBLEMS: ReadonlySet<number> = new Set([400, 401, 403, 429]);

export function isKeyProblem(error: unknown): boolean {
  return error instanceof ProviderError && KEY_PROBLEMS.has(error.status);
}

export function failover(chain: readonly WallpaperProvider[]): WallpaperProvider {
  if (chain.length === 0) throw new Error('failover needs at least one provider');
  if (chain.length === 1) return chain[0];
  let at = 0;

  async function run<T>(call: (p: WallpaperProvider) => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < chain.length; i++) {
      const index = (at + i) % chain.length;
      try {
        const result = await call(chain[index]);
        at = index;
        return result;
      } catch (error) {
        if (!isKeyProblem(error)) throw error;
        last = error;
      }
    }
    throw last;
  }

  const first = chain[0];
  return {
    name: first.name,
    label: first.label,
    homepage: first.homepage,
    page: (feed, page, size) => run((p) => p.page(feed, page, size)),
    get: (id) => run((p) => p.get(id)),
    used: first.used ? (id) => run((p) => p.used!(id)) : undefined,
  };
}
