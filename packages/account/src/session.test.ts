import { describe, expect, it, vi } from 'vitest';
import {
  AccountClient,
  EMPTY_LIBRARY,
  INITIAL_ACCOUNT,
  createSession,
  memoryTokenStore,
  type AccountHost,
  type AccountState,
  type Library,
  type LocalLibrary,
  type Ownership,
  type PlanState,
} from './index';

const PRO_ID = 'prod-pro';
const future = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const pro = (expiresAt: string | null = null): Ownership => ({
  ownershipId: 'o', productId: PRO_ID, ownershipType: 'subscription', grantedAt: '2026-01-01T00:00:00Z', expiresAt,
});

/** A CDS with auth, ownerships, the catalog lookup and the library endpoint. */
function cds(opts: { ownerships?: Ownership[]; down?: boolean } = {}) {
  const state = { ownerships: opts.ownerships ?? [], down: opts.down ?? false, library: null as null | { revision: string; library: Library }, puts: 0, gets: 0 };
  let n = 0;
  const fetch = (async (url: string, init: RequestInit) => {
    if (state.down) throw new TypeError('Network request failed');
    const path = new URL(url).pathname;
    const auth = (init.headers as Record<string, string>).Authorization;
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
    if (path === '/api/v1/catalog/products/drift-pro') return json(200, { product: { productId: PRO_ID } });
    if (auth !== 'Bearer tok') return json(401, { message: 'Session expired' });
    switch (path) {
      case '/api/auth/me': return json(200, { user: { id: 'u1', email: 'a@x.com' } });
      case '/api/v1/me/ownership': return json(200, { ownerships: state.ownerships });
      case '/api/auth/logout': return json(200, {});
      case '/api/v1/drift/library':
        if (init.method === 'GET') { state.gets++; return json(200, state.library ?? { revision: null, library: EMPTY_LIBRARY }); }
        state.puts++;
        state.library = { revision: String(++n).padStart(32, '0'), library: JSON.parse(init.body as string).library };
        return json(200, { revision: state.library.revision });
      default: return json(404, {});
    }
  }) as typeof globalThis.fetch;
  return { fetch, state };
}

function host(initial: LocalLibrary = { favs: [1], lists: [], following: [] }) {
  let account: AccountState = INITIAL_ACCOUNT;
  let library = initial;
  const listeners = new Set<() => void>();
  const kv = new Map<string, string>();
  const plans: PlanState[] = [];
  const h: AccountHost = {
    account: () => account,
    setAccount: (p) => { account = { ...account, ...p }; },
    setPlan: (p) => { plans.push(p); account = { ...account, plan: p }; },
    library: () => library,
    setLibrary: (l) => { library = l; listeners.forEach((f) => f()); },
    onLibraryChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
    storage: { read: async (k) => kv.get(k) ?? null, write: async (k, v) => void kv.set(k, v), remove: async (k) => void kv.delete(k) },
  };
  return { h, kv, plans, edit: (l: LocalLibrary) => h.setLibrary(l), get account() { return account; }, get library() { return library; } };
}

const client = (fetch: typeof globalThis.fetch, token: string | null = 'tok') =>
  new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore(token), fetch });

describe('session restore', () => {
  it('signs in, finds Pro by slug, and saves a snapshot', async () => {
    const server = cds({ ownerships: [pro()] });
    const app = host();
    await createSession(client(server.fetch), app.h).restore();
    expect(app.account).toMatchObject({ status: 'signedIn', offline: false });
    expect(app.account.plan.plan).toBe('pro');
    expect(JSON.parse(app.kv.get('drift.account.snapshot')!).proProductId).toBe(PRO_ID);
  });

  it('keeps Drift Pro offline from the snapshot, until the grant expires', async () => {
    const server = cds({ ownerships: [pro(future(3))] });
    const first = host();
    await createSession(client(server.fetch), first.h).restore();

    server.state.down = true;
    const offline = host();
    offline.kv.set('drift.account.snapshot', first.kv.get('drift.account.snapshot')!);
    await createSession(client(server.fetch), offline.h).restore();
    expect(offline.account).toMatchObject({ status: 'signedIn', offline: true });
    expect(offline.account.plan.plan).toBe('pro');

    const snap = JSON.parse(first.kv.get('drift.account.snapshot')!);
    snap.ownerships = [pro(future(-1))];
    const lapsed = host();
    lapsed.kv.set('drift.account.snapshot', JSON.stringify(snap));
    await createSession(client(server.fetch), lapsed.h).restore();
    expect(lapsed.account.plan.plan).toBe('free');
  });

  it('stays signed out offline with no snapshot, without dropping the token', async () => {
    const server = cds({ down: true });
    const tokens = memoryTokenStore('tok');
    const app = host();
    await createSession(new AccountClient({ baseUrl: 'https://cds.test', tokenStore: tokens, fetch: server.fetch }), app.h).restore();
    expect(app.account.status).toBe('signedOut');
    expect(await tokens.read()).toBe('tok');
  });

  it('drops an expired session and its snapshot', async () => {
    const server = cds();
    const app = host();
    app.kv.set('drift.account.snapshot', '{}');
    await createSession(client(server.fetch, 'stale'), app.h).restore();
    expect(app.account.status).toBe('signedOut');
    expect(app.kv.has('drift.account.snapshot')).toBe(false);
  });

  it('keeps the plan when a refresh fails, and flags the error', async () => {
    const server = cds({ ownerships: [pro()] });
    const app = host();
    const session = createSession(client(server.fetch), app.h);
    await session.restore();
    server.state.down = true;
    await session.refreshPlan();
    expect(app.account.plan.plan).toBe('pro');
    expect(app.account).toMatchObject({ offline: true, planError: 'Could not reach CyKrome. Check your connection.' });
  });

  it('signs out cleanly', async () => {
    const server = cds({ ownerships: [pro()] });
    const app = host();
    const session = createSession(client(server.fetch), app.h);
    await session.restore();
    await session.signOut();
    expect(app.account).toMatchObject({ status: 'signedOut', user: null });
    expect(app.account.plan.plan).toBe('free');
    expect(app.kv.has('drift.account.snapshot')).toBe(false);
  });
});

describe('library sync', () => {
  it('does nothing for a free account', async () => {
    const server = cds();
    const app = host();
    const session = createSession(client(server.fetch), app.h, { pushDelayMs: 0 });
    await session.restore();
    app.edit({ favs: [1, 2], lists: [], following: [] });
    await session.syncNow();
    expect(server.state.gets + server.state.puts).toBe(0);
    expect(app.account.sync.state).toBe('off');
  });

  it('syncs on sign-in, pushes later edits, and brings in other devices’ changes', async () => {
    vi.useFakeTimers();
    try {
      const server = cds({ ownerships: [pro()] });
      const desktop = host({ favs: [1], lists: [], following: [] });
      const ds = createSession(client(server.fetch), desktop.h, { pushDelayMs: 100 });
      await ds.restore();
      await vi.waitFor(() => expect(desktop.account.sync.state).toBe('idle'));
      expect(server.state.library!.library.favs['1'].on).toBe(true);

      desktop.edit({ favs: [5, 1], lists: [{ id: 'l', name: 'Night', items: [5] }], following: [] });
      await vi.advanceTimersByTimeAsync(150);
      await vi.waitFor(() => expect(server.state.library!.library.lists.l?.name).toBe('Night'));

      const phone = host({ favs: [], lists: [], following: ['Mira'] });
      await createSession(client(server.fetch), phone.h).restore();
      await vi.waitFor(() => expect(phone.account.sync.state).toBe('idle'));
      expect(phone.library.favs).toEqual([5, 1]);
      expect(phone.library.lists).toEqual([{ id: 'l', name: 'Night', items: [5] }]);
      expect(phone.library.following).toEqual(['Mira']);

      await ds.syncNow();
      expect(desktop.library.following).toEqual(['Mira']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a removal on one device beat the defaults of a device that never synced', async () => {
    const server = cds({ ownerships: [pro()] });
    const a = host({ favs: [6, 14], lists: [], following: [] });
    const sa = createSession(client(server.fetch), a.h, { pushDelayMs: 0 });
    await sa.restore();
    await vi.waitFor(() => expect(a.account.sync.state).toBe('idle'));
    a.edit({ favs: [6], lists: [], following: [] });
    await sa.syncNow();
    await vi.waitFor(() => expect(server.state.library!.library.favs['14'].on).toBe(false));

    const fresh = host({ favs: [6, 14], lists: [], following: [] });
    await createSession(client(server.fetch), fresh.h).restore();
    await vi.waitFor(() => expect(fresh.account.sync.state).toBe('idle'));
    expect(fresh.library.favs).toEqual([6]);
  });
});
