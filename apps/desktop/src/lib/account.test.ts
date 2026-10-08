import { beforeEach, describe, expect, it, vi } from 'vitest';

// The OS credential store lives in Rust (src-tauri/src/secrets.rs); this stands in for it.
const keychain = vi.hoisted(() => ({ token: null as string | null, calls: [] as string[] }));

vi.mock('./platform', () => ({ inTauri: true, openExternal: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: { token?: string }) => {
    keychain.calls.push(cmd);
    if (cmd === 'session_token_get') return keychain.token;
    if (cmd === 'session_token_set') keychain.token = args!.token!;
    if (cmd === 'session_token_clear') keychain.token = null;
  }),
}));

const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const path = new URL(url).pathname;
  const auth = (init.headers as Record<string, string>).Authorization;
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
  if (path === '/api/auth/me') return auth === 'Bearer legacy' ? json(200, { user: { id: 'u1', email: 'a@x.com' } }) : json(401, {});
  if (path === '/api/v1/me/ownership') return json(200, { ownerships: [] });
  if (path.startsWith('/api/v1/catalog/products/')) return json(404, {});
  return json(200, {});
});

async function fresh() {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  const account = await import('./account');
  const store = await import('./store');
  return { ...account, ...store };
}

describe('desktop session token', () => {
  beforeEach(() => {
    localStorage.clear();
    keychain.token = null;
    keychain.calls = [];
  });

  it('moves a token left in webview storage into the keychain', async () => {
    localStorage.setItem('drift.cykrome-token', 'legacy');
    const { restoreSession, getState } = await fresh();
    await restoreSession();
    expect(getState().account.status).toBe('signedIn');
    expect(keychain.token).toBe('legacy');
    expect(localStorage.getItem('drift.cykrome-token')).toBeNull();
  });

  it('clears the keychain on sign-out', async () => {
    keychain.token = 'legacy';
    const { restoreSession, signOut, getState } = await fresh();
    await restoreSession();
    await signOut();
    expect(keychain.token).toBeNull();
    expect(getState().account.status).toBe('signedOut');
  });

  it('never writes the token to webview storage', async () => {
    keychain.token = 'legacy';
    const { restoreSession } = await fresh();
    await restoreSession();
    expect(Object.keys({ ...localStorage }).some((k) => (localStorage.getItem(k) ?? '').includes('legacy'))).toBe(false);
  });
});
