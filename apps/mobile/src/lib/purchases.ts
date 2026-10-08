// Buying Drift Pro in the App Store / Google Play.
//
// The store handles payment; CDS decides access. A purchase is reported to CDS, which verifies it
// with Apple or Google (packages/account → /api/v1/purchases/*) and answers with the account's
// ownerships. Only then is the transaction finished. An unfinished one is redelivered by the store
// on the next launch, so a purchase made with no connection is not lost.
//
// Each purchase carries the CyKrome account it was made from (iOS appAccountToken, Play
// obfuscatedAccountId); CDS refuses to grant it to any other account.
//
// expo-iap is native. Expo Go does not have it, so it is loaded lazily and its absence is reported
// rather than crashing the Upgrade screen.

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { accountToken, type Offering } from '@drift/account';
import { account, messageOf, session } from './account';
import { getState, toast } from './store';

type Iap = typeof import('expo-iap');
type Purchase = import('expo-iap').Purchase;

let iap: Promise<Iap | null> | null = null;
function store(): Promise<Iap | null> {
  iap ??= import('expo-iap').catch(() => null);
  return iap;
}

export interface StoreOffer {
  sku: string;
  kind: Offering['kind'];
  title: string;
  price: string;
  /** Play subscriptions are bought through one of their offers. */
  offerToken?: string;
}

const provider = () => (Platform.OS === 'ios' ? 'apple' : 'google');

let connected: Promise<unknown> | null = null;
function connect(s: Iap): Promise<unknown> {
  connected ??= s.initConnection().catch((err: unknown) => {
    connected = null;
    throw err;
  });
  return connected;
}

/** Report a store purchase to CDS, apply the plan it answers with, then finish it with the store. */
async function settle(purchase: Purchase): Promise<boolean> {
  const s = await store();
  if (!s || purchase.purchaseState !== 'purchased' || !purchase.purchaseToken) return false;
  const ownerships =
    Platform.OS === 'ios'
      ? await account.reportApplePurchase(purchase.purchaseToken)
      : await account.reportGooglePurchase({
          packageName: ('packageNameAndroid' in purchase && purchase.packageNameAndroid) || Application.applicationId || '',
          productId: purchase.productId,
          purchaseToken: purchase.purchaseToken,
        });
  await session.applyOwnerships(ownerships);
  await s.finishTransaction({ purchase, isConsumable: false });
  return true;
}

let listening = false;

/** Start listening for purchase results. Call once at launch. */
export async function listenForPurchases(): Promise<void> {
  if (listening) return;
  listening = true;
  const s = await store();
  if (!s) return;
  void connect(s).catch(() => {});
  s.purchaseUpdatedListener((purchase) => {
    if (getState().account.status !== 'signedIn') return;
    settle(purchase)
      .then((ok) => ok && toast('Welcome to Drift Pro'))
      .catch((err) => toast(`Purchase saved — Drift will finish it later (${messageOf(err)})`, 'info'));
  });
  s.purchaseErrorListener((error) => {
    if (s.isUserCancelledError?.(error)) return;
    toast(error.message || 'The purchase did not go through', 'info');
  });
}

/** What this store sells for Drift Pro, with local prices. Empty in Expo Go or with no store set up. */
export async function proOffers(): Promise<StoreOffer[]> {
  const s = await store();
  if (!s) return [];
  const offerings = (await session.offerings()).filter((o) => o.provider === provider());
  if (!offerings.length) return [];
  await connect(s);

  const offers: StoreOffer[] = [];
  for (const kind of ['subscription', 'lifetime'] as const) {
    const skus = offerings.filter((o) => o.kind === kind).map((o) => o.sku);
    if (!skus.length) continue;
    const products = (await s.fetchProducts({ skus, type: kind === 'subscription' ? 'subs' : 'in-app' })) ?? [];
    for (const p of products as Array<Record<string, any>>) {
      const offerToken =
        Platform.OS === 'android' && kind === 'subscription'
          ? (p.subscriptionOffers as Array<{ offerTokenAndroid?: string | null }> | undefined)?.find((o) => o.offerTokenAndroid)?.offerTokenAndroid ?? undefined
          : undefined;
      offers.push({ sku: p.id, kind, title: p.displayName ?? p.title, price: p.displayPrice, offerToken });
    }
  }
  return offers;
}

/** Start the store's purchase sheet. The result arrives through listenForPurchases. */
export async function buy(offer: StoreOffer): Promise<void> {
  const s = await store();
  const user = getState().account.user;
  if (!s || !user) return;
  await connect(s);
  const google = { skus: [offer.sku], obfuscatedAccountId: user.id };
  const apple = { sku: offer.sku, appAccountToken: accountToken(user.id) };
  if (offer.kind === 'subscription') {
    await s.requestPurchase({
      type: 'subs',
      request: {
        apple,
        google: { ...google, subscriptionOffers: offer.offerToken ? [{ sku: offer.sku, offerToken: offer.offerToken }] : undefined },
      },
    });
  } else {
    await s.requestPurchase({ type: 'in-app', request: { apple, google } });
  }
}

/** Re-report everything the store says this device owns — the "Restore purchases" button. */
export async function restorePurchases(): Promise<number> {
  const s = await store();
  if (!s) return 0;
  await connect(s);
  await s.restorePurchases();
  let restored = 0;
  for (const purchase of await s.getAvailablePurchases()) {
    try {
      if (await settle(purchase)) restored++;
    } catch (err) {
      // A purchase from another CyKrome account stays with that account.
      console.warn('[purchases] could not restore', purchase.productId, messageOf(err));
    }
  }
  await session.refreshPlan();
  return restored;
}
