// CyKrome Account on the phone.
//
// Sign-in is by emailed code only: password sign-in seals the password with WebCrypto RSA-OAEP,
// which Hermes does not provide. Codes are also the better phone experience.

import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { AccountApiError, AccountClient, FREE_PLAN, resolvePlan, type TokenStore } from '@drift/account';
import { canApply, canCreateList, type ProFeature, type Wallpaper } from '@drift/core';
import { getState, setPlan, setState } from './store';

const BASE_URL = process.env.EXPO_PUBLIC_CDS_BASE_URL || 'https://api.cykrome.com';
const PRO_PRODUCT_ID = process.env.EXPO_PUBLIC_DRIFT_PRO_PRODUCT_ID || '';
const TOKEN_KEY = 'drift.cykrome-token';

/** Keychain on iOS, Keystore-backed storage on Android. */
const tokenStore: TokenStore = {
  read: () => SecureStore.getItemAsync(TOKEN_KEY),
  write: (t) => SecureStore.setItemAsync(TOKEN_KEY, t),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

export const account = new AccountClient({ baseUrl: BASE_URL, brand: 'nexus', tokenStore });
export const proProductConfigured = PRO_PRODUCT_ID !== '';

export function messageOf(err: unknown): string {
  if (err instanceof AccountApiError) return err.message;
  if (err instanceof TypeError) return 'Could not reach CyKrome. Check your connection.';
  return err instanceof Error ? err.message : String(err);
}

export async function refreshPlan(): Promise<void> {
  try {
    setPlan(resolvePlan(await account.ownerships(), PRO_PRODUCT_ID));
  } catch (err) {
    if (err instanceof AccountApiError && err.isAuthFailure) return void (await signOut());
    setState((s) => ({ account: { ...s.account, planError: messageOf(err) } }));
  }
}

export async function restoreSession(): Promise<void> {
  try {
    const user = await account.restore();
    setState((s) => ({ account: { ...s.account, status: user ? 'signedIn' : 'signedOut', user } }));
    if (user) await refreshPlan();
  } catch (err) {
    setState((s) => ({ account: { ...s.account, status: 'signedOut', planError: messageOf(err) } }));
  }
}

export const requestCode = (email: string) => account.requestCode(email);

export async function signInWithCode(email: string, code: string): Promise<void> {
  const { user } = await account.signInWithCode(email, code);
  setState((s) => ({ account: { ...s.account, status: 'signedIn', user } }));
  await refreshPlan();
}

export async function signOut(): Promise<void> {
  await account.signOut();
  setState((s) => ({ account: { ...s.account, status: 'signedOut', user: null } }));
  setPlan(FREE_PLAN);
}

// ---- gates: true when the action may proceed, otherwise the upgrade sheet opens ----

function gate(allowed: boolean, feature: ProFeature): boolean {
  if (!allowed) {
    setState({ upgradeFeature: feature });
    router.push('/upgrade');
  }
  return allowed;
}

export const requirePro = {
  wallpaper: (w: Wallpaper) => gate(canApply(getState().account.plan.plan, w.tier), 'proWallpapers'),
  newList: () => gate(canCreateList(getState().account.plan.plan, getState().lists.length), 'unlimitedLists'),
  feature: (feature: ProFeature) => gate(getState().account.plan.plan === 'pro', feature),
};
