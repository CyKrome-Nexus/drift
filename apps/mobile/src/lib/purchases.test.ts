import { beforeEach, describe, expect, it, vi } from 'vitest';
import { native } from '../test/fakes';

const USER = '665a0f3b2e4e1a001f8b4321';

/** expo-iap: a store that hands back whatever purchase the test queues. */
const iap = vi.hoisted(() => ({
  onPurchase: null as null | ((p: any) => void),
  requests: [] as any[],
  finished: [] as any[],
  available: [] as any[],
  products: [] as any[],
}));

vi.mock('expo-iap', () => ({
  initConnection: vi.fn(async () => true),
  purchaseUpdatedListener: (f: (p: any) => void) => { iap.onPurchase = f; return { remove() {} }; },
  purchaseErrorListener: () => ({ remove() {} }),
  isUserCancelledError: () => false,
  fetchProducts: vi.fn(async ({ skus }: { skus: string[] }) => iap.products.filter((p) => skus.includes(p.id))),
  requestPurchase: vi.fn(async (args: any) => { iap.requests.push(args); return null; }),
  finishTransaction: vi.fn(async ({ purchase }: any) => { iap.finished.push(purchase); }),
  restorePurchases: vi.fn(async () => {}),
  getAvailablePurchases: vi.fn(async () => iap.available),
}));

/** CDS: verifies what the app reports and answers with ownerships. */
const cds = vi.hoisted(() => ({ down: false, reported: [] as Array<{ path: string; body: any }> }));

async function fresh() {
  vi.resetModules();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (cds.down) throw new TypeError('Network request failed');
    const path = new URL(url).pathname;
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
    const owned = [{ ownershipId: 'o', productId: 'prod-pro', ownershipType: 'subscription', grantedAt: '', expiresAt: null }];
    switch (path) {
      case '/api/auth/me': return json(200, { user: { id: USER, email: 'a@x.com' } });
      case '/api/v1/me/ownership': return json(200, { ownerships: cds.reported.length ? owned : [] });
      case '/api/v1/catalog/products/drift-pro': return json(200, { product: { productId: 'prod-pro' } });
      case '/api/v1/purchases/offerings':
        return json(200, { offerings: [
          { provider: 'apple', sku: 'com.cykrome.drift.pro.yearly', kind: 'subscription' },
          { provider: 'google', sku: 'drift_pro', kind: 'subscription' },
        ] });
      case '/api/v1/purchases/apple':
      case '/api/v1/purchases/google':
        cds.reported.push({ path, body: JSON.parse(init.body as string) });
        return json(200, { ownerships: owned });
      case '/api/v1/drift/library': return json(200, { revision: null, library: { favs: {}, lists: {}, following: {} } });
      default: return json(404, {});
    }
  });
  native.secure.set('drift.cykrome-token', 'tok');
  const store = await import('./store');
  const account = await import('./account');
  const purchases = await import('./purchases');
  await store.loadPersisted();
  await account.restoreSession();
  return { ...store, ...account, ...purchases };
}

const settled = () => new Promise((r) => setTimeout(r, 20));

describe('buying Drift Pro', () => {
  beforeEach(() => {
    Object.assign(iap, { onPurchase: null, requests: [], finished: [], available: [], products: [] });
    Object.assign(cds, { down: false, reported: [] });
  });

  it('ties an App Store purchase to the account, reports it, then finishes it', async () => {
    iap.products = [{ id: 'com.cykrome.drift.pro.yearly', displayName: 'Yearly', displayPrice: '₹1,499' }];
    const { proOffers, buy, listenForPurchases, getState } = await fresh();
    await listenForPurchases();
    const [offer] = await proOffers();
    expect(offer).toMatchObject({ sku: 'com.cykrome.drift.pro.yearly', price: '₹1,499', kind: 'subscription' });

    await buy(offer);
    expect(iap.requests[0]).toMatchObject({ type: 'subs', request: { apple: { appAccountToken: '665a0f3b-2e4e-1a00-1f8b-432100000000' } } });

    iap.onPurchase!({ productId: offer.sku, purchaseState: 'purchased', purchaseToken: 'signed.jws.here' });
    await settled();
    expect(cds.reported).toEqual([{ path: '/api/v1/purchases/apple', body: { signedTransaction: 'signed.jws.here' } }]);
    expect(getState().account.plan.plan).toBe('pro');
    expect(iap.finished).toHaveLength(1);
  });

  it('leaves the transaction unfinished when CyKrome cannot be reached, so the store redelivers it', async () => {
    const { listenForPurchases, getState } = await fresh();
    await listenForPurchases();
    cds.down = true;
    iap.onPurchase!({ productId: 'com.cykrome.drift.pro.yearly', purchaseState: 'purchased', purchaseToken: 'jws' });
    await settled();
    expect(iap.finished).toHaveLength(0);
    expect(getState().toast?.text).toContain('finish it later');
  });

  it('on Android, buys through the Play offer with the account id, and reports the token', async () => {
    native.os = 'android';
    iap.products = [{ id: 'drift_pro', title: 'Drift Pro', displayPrice: '₹149', subscriptionOffers: [{ offerTokenAndroid: 'offer-1' }] }];
    const { proOffers, buy, listenForPurchases } = await fresh();
    await listenForPurchases();
    const [offer] = await proOffers();
    await buy(offer);
    expect(iap.requests[0].request.google).toEqual({ skus: ['drift_pro'], obfuscatedAccountId: USER, subscriptionOffers: [{ sku: 'drift_pro', offerToken: 'offer-1' }] });

    iap.onPurchase!({ productId: 'drift_pro', purchaseState: 'purchased', purchaseToken: 'play-token', packageNameAndroid: 'com.cykrome.drift' });
    await settled();
    expect(cds.reported[0]).toEqual({ path: '/api/v1/purchases/google', body: { packageName: 'com.cykrome.drift', productId: 'drift_pro', purchaseToken: 'play-token' } });
  });

  it('ignores pending purchases', async () => {
    const { listenForPurchases } = await fresh();
    await listenForPurchases();
    iap.onPurchase!({ productId: 'x', purchaseState: 'pending', purchaseToken: 'jws' });
    await settled();
    expect(cds.reported).toHaveLength(0);
    expect(iap.finished).toHaveLength(0);
  });

  it('restores what the store says this device owns', async () => {
    iap.available = [{ productId: 'com.cykrome.drift.pro.yearly', purchaseState: 'purchased', purchaseToken: 'old.jws' }];
    const { restorePurchases, getState } = await fresh();
    expect(await restorePurchases()).toBe(1);
    expect(getState().account.plan.plan).toBe('pro');
  });
});

describe('phone sign-in', () => {
  it('seals passwords without WebCrypto (Hermes)', async () => {
    const { webcrypto } = await import('node:crypto');
    const keys = await webcrypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey)).toString('base64')}\n-----END PUBLIC KEY-----`;
    let sealed = '';
    vi.resetModules();
    vi.stubGlobal('crypto', undefined);
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (path === '/api/auth/public-key') return json({ publicKey: pem });
      if (path === '/api/auth/login') { sealed = JSON.parse(init.body as string).password; return json({ token: 't', user: { id: USER, email: 'a@x.com' } }); }
      if (path === '/api/v1/me/ownership') return json({ ownerships: [] });
      return new Response('{}', { status: 404 });
    });
    try {
      const { signInWithPassword } = await import('./account');
      const { getState } = await import('./store');
      await signInWithPassword('a@x.com', 'hunter2');
      expect(getState().account.status).toBe('signedIn');
      const plain = new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, keys.privateKey, Buffer.from(sealed, 'base64')));
      expect(plain).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
