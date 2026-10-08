// CyKrome Account for the desktop app: the shared session (packages/account/src/session.ts) wired
// to this app's store, plus the Pro gates and the online checkout.

import { AccountClient, createSession, messageOf, type AccountHost, type TokenStore } from '@drift/account';
import { LINKS, canApply, canCreateList, type ProFeature, type Wallpaper } from '@drift/core';
import { invoke } from '@tauri-apps/api/core';
import { inTauri, openExternal } from './platform';
import { getState, setPlan, setState, showUpgrade, subscribe, toast } from './store';

export { messageOf };

const BASE_URL = import.meta.env.VITE_CDS_BASE_URL || 'https://api.cykrome.com';
/** Optional: normally the Drift Pro product is found in the catalog by its slug. */
const PRO_PRODUCT_ID = import.meta.env.VITE_DRIFT_PRO_PRODUCT_ID || '';

/** Where the token lived before it moved to the OS credential store. */
const LEGACY_TOKEN_KEY = 'drift.cykrome-token';

const browserStorage = {
  read: async (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  write: async (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } },
  remove: async (k: string) => { try { localStorage.removeItem(k); } catch { /* nothing to clear */ } },
};

/**
 * The OS credential store (Keychain, Credential Manager, Secret Service) via src-tauri/secrets.rs.
 * A token left in webview storage by an older build is moved across on first read. Under plain
 * `vite` there is no keychain, so the browser preview keeps using localStorage.
 */
const tokenStore: TokenStore = inTauri
  ? {
      async read() {
        const token = await invoke<string | null>('session_token_get');
        if (token) return token;
        const legacy = await browserStorage.read(LEGACY_TOKEN_KEY);
        if (!legacy) return null;
        await invoke('session_token_set', { token: legacy });
        await browserStorage.remove(LEGACY_TOKEN_KEY);
        return legacy;
      },
      write: (token) => invoke('session_token_set', { token }),
      async clear() {
        await invoke('session_token_clear');
        await browserStorage.remove(LEGACY_TOKEN_KEY);
      },
    }
  : {
      read: () => browserStorage.read(LEGACY_TOKEN_KEY),
      write: (t) => browserStorage.write(LEGACY_TOKEN_KEY, t),
      clear: () => browserStorage.remove(LEGACY_TOKEN_KEY),
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
  storage: browserStorage,
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

/** Opens Razorpay's payment page for Drift Pro, or the Pro web page if online purchase is off. */
export async function buyPro(): Promise<void> {
  try {
    await openExternal(await session.checkoutUrl());
    toast('Finish in your browser — Drift updates when you come back', 'info');
  } catch (err) {
    console.warn('[account] checkout unavailable, opening the Pro page', messageOf(err));
    await openExternal(LINKS.pro);
  }
}

// ---- gates ----
// Each returns true when the action may proceed, and otherwise opens the upgrade sheet.

function gate(allowed: boolean, feature: ProFeature): boolean {
  if (!allowed) showUpgrade(feature);
  return allowed;
}

export const requirePro = {
  wallpaper: (w: Wallpaper) => gate(canApply(getState().account.plan.plan, w.tier), 'proWallpapers'),
  newList: () => gate(canCreateList(getState().account.plan.plan, getState().lists.length), 'unlimitedLists'),
  feature: (feature: ProFeature) => gate(getState().account.plan.plan === 'pro', feature),
};
