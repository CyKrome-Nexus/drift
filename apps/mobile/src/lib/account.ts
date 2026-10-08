// CyKrome Account on the phone: the shared session (packages/account/src/session.ts) wired to
// this app's store, plus the Pro gates.
//
// Password sign-in works here too. Hermes has no WebCrypto, so @drift/account seals the password
// with its plain-JS RSA-OAEP; that needs a secure random source, which expo-crypto provides.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomValues } from 'expo-crypto';
import { router } from 'expo-router';
import { AccountClient, createSession, messageOf, type AccountHost, type TokenStore } from '@drift/account';
import { canApply, canCreateList, type ProFeature, type Wallpaper } from '@drift/core';
import { getState, setPlan, setState, subscribe } from './store';

export { messageOf };

if (!globalThis.crypto?.getRandomValues) {
  (globalThis as { crypto?: Partial<Crypto> }).crypto = {
    ...globalThis.crypto,
    getRandomValues: getRandomValues as Crypto['getRandomValues'],
  };
}

const BASE_URL = process.env.EXPO_PUBLIC_CDS_BASE_URL || 'https://api.cykrome.com';
/** Optional: normally the Drift Pro product is found in the catalog by its slug. */
const PRO_PRODUCT_ID = process.env.EXPO_PUBLIC_DRIFT_PRO_PRODUCT_ID || '';
const TOKEN_KEY = 'drift.cykrome-token';

/** Keychain on iOS, Keystore-backed storage on Android. */
const tokenStore: TokenStore = {
  read: () => SecureStore.getItemAsync(TOKEN_KEY),
  write: (t) => SecureStore.setItemAsync(TOKEN_KEY, t),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

export const account = new AccountClient({ baseUrl: BASE_URL, brand: 'nexus', tokenStore });

let lastLibrary = { favs: getState().favs, lists: getState().lists, following: getState().following };

const host: AccountHost = {
  account: () => getState().account,
  setAccount: (patch) => setState((s) => ({ account: { ...s.account, ...patch } })),
  setPlan,
  library: () => ({ favs: getState().favs, lists: getState().lists, following: getState().following }),
  setLibrary: ({ favs, lists, following }) => setState({ favs, lists, following }),
  onLibraryChange: (listener) =>
    subscribe(() => {
      const { favs, lists, following } = getState();
      if (favs === lastLibrary.favs && lists === lastLibrary.lists && following === lastLibrary.following) return;
      lastLibrary = { favs, lists, following };
      listener();
    }),
  storage: {
    read: (k) => AsyncStorage.getItem(k),
    write: (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  },
};

export const session = createSession(account, host, { proProductId: PRO_PRODUCT_ID });

export const {
  restore: restoreSession,
  refreshPlan,
  syncNow,
  signOut,
  signInWithPassword,
  requestCode,
  signInWithCode,
  signUp,
} = session;

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
