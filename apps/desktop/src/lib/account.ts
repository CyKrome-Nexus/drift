// CyKrome Account for the desktop app: one client, and the actions the Account screen calls.

import { AccountApiError, AccountClient, FREE_PLAN, resolvePlan, type TokenStore } from '@drift/account';
import { canApply, canCreateList, type ProFeature, type Wallpaper } from '@drift/core';
import { getState, setPlan, setState, showUpgrade } from './store';

const BASE_URL = import.meta.env.VITE_CDS_BASE_URL || 'https://api.cykrome.com';
const PRO_PRODUCT_ID = import.meta.env.VITE_DRIFT_PRO_PRODUCT_ID || '';

const TOKEN_KEY = 'drift.cykrome-token';

/**
 * The webview's localStorage, which Tauri keeps per app identifier on disk. It is the same
 * trade-off Nexus Authenticator makes; moving the token to the OS keychain is a later step.
 */
const tokenStore: TokenStore = {
  async read() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  async write(t) { localStorage.setItem(TOKEN_KEY, t); },
  async clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to clear */ } },
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
    // Keep the last known plan; a flaky network should not downgrade anyone mid-session.
    setState((s) => ({ account: { ...s.account, planError: messageOf(err) } }));
  }
}

export async function restoreSession(): Promise<void> {
  try {
    const user = await account.restore();
    setState((s) => ({ account: { ...s.account, status: user ? 'signedIn' : 'signedOut', user } }));
    if (user) await refreshPlan();
  } catch (err) {
    // Offline at launch: stay signed out for this run, but keep the token for the next one.
    setState((s) => ({ account: { ...s.account, status: 'signedOut', planError: messageOf(err) } }));
  }
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { user } = await account.signInWithPassword(email, password);
  setState((s) => ({ account: { ...s.account, status: 'signedIn', user } }));
  await refreshPlan();
}

export async function requestCode(email: string): Promise<void> {
  await account.requestCode(email);
}

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
