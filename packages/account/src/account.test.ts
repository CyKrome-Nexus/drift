import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccountApiError,
  AccountClient,
  AccountTimeoutError,
  pemToDer,
  rsaOaepEncrypt,
  sha256,
  displayName,
  hashPassword,
  initials,
  memoryTokenStore,
  planLine,
  resolvePlan,
  type Ownership,
} from './index';

const PRO = 'prod-drift-pro';
const own = (o: Partial<Ownership>): Ownership => ({
  ownershipId: 'o', productId: PRO, ownershipType: 'purchase', grantedAt: '2026-01-01T00:00:00Z', expiresAt: null, ...o,
});
const NOW = Date.parse('2026-10-07T00:00:00Z');

describe('resolvePlan', () => {
  it('is free with no matching ownership', () => {
    expect(resolvePlan([], PRO, NOW).plan).toBe('free');
    expect(resolvePlan([own({ productId: 'other' })], PRO, NOW).plan).toBe('free');
  });

  it('is free when the product id is not configured', () => {
    expect(resolvePlan([own({})], '', NOW).plan).toBe('free');
  });

  it('ignores expired grants', () => {
    expect(resolvePlan([own({ expiresAt: '2026-10-01T00:00:00Z' })], PRO, NOW).plan).toBe('free');
  });

  it('picks the longest-lasting grant, with permanent beating dated', () => {
    const dated = resolvePlan([own({ expiresAt: '2026-11-12T00:00:00Z' }), own({ expiresAt: '2027-01-01T00:00:00Z' })], PRO, NOW);
    expect(dated).toEqual({ plan: 'pro', expiresAt: '2027-01-01T00:00:00Z', source: 'purchase' });
    const mixed = resolvePlan([own({ expiresAt: '2027-01-01T00:00:00Z' }), own({ ownershipType: 'beta' })], PRO, NOW);
    expect(mixed).toEqual({ plan: 'pro', expiresAt: null, source: 'beta' });
  });

  it('describes the plan for the account card', () => {
    expect(planLine({ plan: 'free', expiresAt: null, source: null })).toBe('Free plan');
    expect(planLine({ plan: 'pro', expiresAt: '2026-11-12T12:00:00Z', source: 'purchase' })).toBe('Renews Nov 12, 2026');
    expect(planLine({ plan: 'pro', expiresAt: null, source: 'purchase' })).toBe('Lifetime');
  });
});

describe('names', () => {
  it('prefers first and last name, then username, then the email local part', () => {
    expect(displayName({ id: '1', email: 'a@x.com', firstName: 'Aditi', lastName: 'Kumar' })).toBe('Aditi Kumar');
    expect(displayName({ id: '1', email: 'a@x.com', username: 'aditi' })).toBe('aditi');
    expect(displayName({ id: '1', email: 'aditi.k@x.com' })).toBe('aditi.k');
    expect(initials({ id: '1', email: 'a@x.com', firstName: 'Aditi', lastName: 'Kumar' })).toBe('AK');
  });
});

/** A fake CDS: a real RSA key, so the sealed password is decrypted and checked end to end. */
async function fakeCds() {
  const keys = await webcrypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey)).toString('base64');
  const pem = `-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----`;
  const calls: Array<{ path: string; body: any; auth: string | null }> = [];
  let ownerships: Ownership[] = [];
  const signups: any[] = [];
  const open = async (sealed: string) =>
    new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, keys.privateKey, Buffer.from(sealed, 'base64')));

  const fetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body as string) : null;
    const auth = (init.headers as Record<string, string>).Authorization ?? null;
    calls.push({ path, body, auth });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });

    switch (path) {
      case '/api/auth/public-key':
        return json(200, { publicKey: pem });
      case '/api/auth/login': {
        const plain = new TextDecoder().decode(
          await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, keys.privateKey, Buffer.from(body.password, 'base64')),
        );
        if (plain !== (await hashPassword('hunter2'))) return json(401, { message: 'Invalid credentials' });
        return json(200, { token: 'tok-1', user: { id: 'u1', email: body.email } });
      }
      case '/api/auth/signup':
        signups.push(body);
        return json(201, { success: true });
      case '/api/auth/otp/verify':
        return body.code === '123456' ? json(200, { token: 'tok-2', user: { id: 'u1', email: body.email } }) : json(400, { message: ['Invalid code'] });
      case '/api/auth/me':
        return auth === 'Bearer tok-1' || auth === 'Bearer tok-2' ? json(200, { user: { id: 'u1', email: 'a@x.com' } }) : json(401, {});
      case '/api/v1/me/ownership':
        return json(200, { ownerships });
      case '/api/auth/logout':
        return json(500, { message: 'down' });
      default:
        return json(404, {});
    }
  }) as typeof globalThis.fetch;

  return { fetch, calls, signups, open, pem, keys, setOwnerships: (o: Ownership[]) => (ownerships = o) };
}

describe('AccountClient', () => {
  it('seals the password as RSA-OAEP(SHA-256 hex) and stores the token', async () => {
    const cds = await fakeCds();
    const tokens = memoryTokenStore();
    const client = new AccountClient({ baseUrl: 'https://cds.test/', tokenStore: tokens, fetch: cds.fetch });
    const session = await client.signInWithPassword('a@x.com', 'hunter2');
    expect(session.token).toBe('tok-1');
    expect(await tokens.read()).toBe('tok-1');
    const login = cds.calls.find((c) => c.path === '/api/auth/login')!;
    expect(login.body.password).not.toContain('hunter2');
    expect(login.body.brand).toBe('nexus');
  });

  it('rejects a wrong password with a readable error', async () => {
    const cds = await fakeCds();
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore(), fetch: cds.fetch });
    await expect(client.signInWithPassword('a@x.com', 'nope')).rejects.toThrow('Invalid credentials');
  });

  it('signs in with an emailed code, sending brand so the product is linked', async () => {
    const cds = await fakeCds();
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore(), fetch: cds.fetch });
    await expect(client.signInWithCode('a@x.com', '000000')).rejects.toThrow('Invalid code');
    await client.signInWithCode('a@x.com', '123456');
    expect(cds.calls.filter((c) => c.path === '/api/auth/otp/verify').every((c) => c.body.brand === 'nexus')).toBe(true);
    expect(client.isAuthenticated).toBe(true);
  });

  it('restores a good session and quietly drops an expired one', async () => {
    const cds = await fakeCds();
    const good = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore('tok-1'), fetch: cds.fetch });
    expect((await good.restore())?.id).toBe('u1');

    const staleStore = memoryTokenStore('expired');
    const stale = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: staleStore, fetch: cds.fetch });
    expect(await stale.restore()).toBeNull();
    expect(await staleStore.read()).toBeNull();
  });

  it('reads ownerships with the bearer token', async () => {
    const cds = await fakeCds();
    cds.setOwnerships([own({})]);
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore('tok-1'), fetch: cds.fetch });
    await client.restore();
    const rows = await client.ownerships();
    expect(resolvePlan(rows, PRO, NOW).plan).toBe('pro');
    expect(cds.calls.at(-1)!.auth).toBe('Bearer tok-1');
  });

  it('signs out locally even when the server logout fails', async () => {
    const cds = await fakeCds();
    const tokens = memoryTokenStore('tok-1');
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: tokens, fetch: cds.fetch });
    await client.restore();
    await client.signOut();
    expect(client.isAuthenticated).toBe(false);
    expect(await tokens.read()).toBeNull();
  });

  it('flags 401 and 403 as auth failures', () => {
    expect(new AccountApiError('x', 401, null).isAuthFailure).toBe(true);
    expect(new AccountApiError('x', 403, null).isAuthFailure).toBe(true);
    expect(new AccountApiError('x', 500, null).isAuthFailure).toBe(false);
  });
});

describe('plain-JS crypto (the phone has no WebCrypto)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hashes like node across block boundaries', () => {
    for (const len of [0, 1, 55, 56, 63, 64, 65, 200]) {
      const data = new Uint8Array(len).map((_, i) => (i * 7) & 0xff);
      expect(Buffer.from(sha256(data)).toString('hex')).toBe(createHash('sha256').update(data).digest('hex'));
    }
  });

  it('produces RSA-OAEP that WebCrypto decrypts', async () => {
    const cds = await fakeCds();
    const message = new TextEncoder().encode('a'.repeat(64));
    const sealed = rsaOaepEncrypt(message, pemToDer(cds.pem));
    expect(sealed.length).toBe(256);
    expect(await cds.open(Buffer.from(sealed).toString('base64'))).toBe('a'.repeat(64));
  });

  it('signs in with a password when crypto.subtle is missing', async () => {
    const cds = await fakeCds();
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => webcrypto.getRandomValues(a) });
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore(), fetch: cds.fetch });
    expect((await client.signInWithPassword('a@x.com', 'hunter2')).token).toBe('tok-1');
  });
});

describe('sign-up and timeouts', () => {
  it('signs up with a sealed password and the brand', async () => {
    const cds = await fakeCds();
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore(), fetch: cds.fetch });
    await client.signUp({ email: ' a@x.com ', username: 'aditi', firstName: 'Aditi', lastName: 'K', password: 'hunter2' });
    const [body] = cds.signups;
    expect(body).toMatchObject({ email: 'a@x.com', username: 'aditi', brand: 'nexus' });
    expect(await cds.open(body.password)).toBe(await hashPassword('hunter2'));
  });

  it('signs up without a password for code-only accounts', async () => {
    const cds = await fakeCds();
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore(), fetch: cds.fetch });
    await client.signUp({ email: 'a@x.com', username: 'aditi', firstName: 'Aditi', lastName: 'K' });
    expect(cds.signups[0]).not.toHaveProperty('password');
    expect(cds.calls.some((c) => c.path === '/api/auth/public-key')).toBe(false);
  });

  it('gives up on a hung request with a readable error', async () => {
    const hung = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    const client = new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore('tok'), fetch: hung, timeoutMs: 20 });
    await expect(client.restore()).rejects.toBeInstanceOf(AccountTimeoutError);
  });
});
