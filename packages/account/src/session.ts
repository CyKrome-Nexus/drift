// The account side of a Drift app, shared by desktop and phone: session restore (online and
// offline), the Drift Pro plan, sign-in and sign-up, purchases, and library sync.
//
// Each app supplies a host: its store's account slice, its library (favourites, lists, followed
// creators), and somewhere to keep two small records between launches. Everything else — what
// happens when the network is down, when Pro lapses, when two devices edit at once — is decided
// here, once, and tested here.

import { AccountApiError, AccountTimeoutError, type CyKromeUser, type Ownership, type SignUpDetails, type AccountSnapshot } from './types';
import type { AccountClient } from './client';
import { FREE_PLAN, resolvePlan, type PlanState } from './plan';
import { EMPTY_LIBRARY, apply, mergeLibraries, sameLibrary, stamp, syncLibrary, type Library, type LocalLibrary } from './sync';

export type AccountStatus = 'restoring' | 'signedOut' | 'signedIn';

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'error';
  lastSyncedAt: number | null;
  error: string | null;
}

export interface AccountState {
  status: AccountStatus;
  user: CyKromeUser | null;
  plan: PlanState;
  planError: string | null;
  /** Signed in from the saved snapshot because CyKrome could not be reached. */
  offline: boolean;
  sync: SyncStatus;
}

export const INITIAL_ACCOUNT: AccountState = {
  status: 'restoring',
  user: null,
  plan: FREE_PLAN,
  planError: null,
  offline: false,
  sync: { state: 'off', lastSyncedAt: null, error: null },
};

export interface KeyValueStore {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface AccountHost {
  account(): AccountState;
  setAccount(patch: Partial<AccountState>): void;
  /** Called on every plan change, so the app can clamp Pro-only settings. */
  setPlan(plan: PlanState): void;
  library(): LocalLibrary;
  setLibrary(library: LocalLibrary): void;
  /** Calls back whenever the app's library changes. Returns an unsubscribe. */
  onLibraryChange(listener: () => void): () => void;
  storage: KeyValueStore;
}

export interface SessionOptions {
  /** Catalog slug of Drift Pro. */
  proSlug?: string;
  /** Build-time override of the product id; normally it is looked up by slug. */
  proProductId?: string;
  /** How long local edits wait before they are pushed, so a burst of taps is one write. */
  pushDelayMs?: number;
}

const SNAPSHOT_KEY = 'drift.account.snapshot';
const SYNC_KEY = 'drift.account.sync';

/** Stamp for the library a device had before it ever synced: older than any real edit. */
const PRE_SYNC_STAMP = 1_000_000;

interface SyncMeta {
  userId: string | null;
  library: Library;
  revision: string | null;
}

/** No answer from CyKrome (offline, timed out, or the server failing) — not a "no". */
export function isUnreachable(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    err instanceof AccountTimeoutError ||
    (err instanceof AccountApiError && err.status >= 500)
  );
}

export function messageOf(err: unknown): string {
  if (err instanceof AccountTimeoutError) return err.message;
  if (err instanceof AccountApiError) return err.message;
  if (err instanceof TypeError) return 'Could not reach CyKrome. Check your connection.';
  return err instanceof Error ? err.message : String(err);
}

export function createSession(client: AccountClient, host: AccountHost, opts: SessionOptions = {}) {
  const proSlug = opts.proSlug ?? 'drift-pro';
  const pushDelayMs = opts.pushDelayMs ?? 1500;
  let proProductId: string | null = opts.proProductId || null;
  let meta: SyncMeta | null = null;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let syncing: Promise<void> | null = null;

  const setSync = (patch: Partial<SyncStatus>) => host.setAccount({ sync: { ...host.account().sync, ...patch } });
  const isPro = () => host.account().status === 'signedIn' && host.account().plan.plan === 'pro';

  // ---- snapshot (offline) ----

  async function readSnapshot(): Promise<AccountSnapshot | null> {
    try {
      const raw = await host.storage.read(SNAPSHOT_KEY);
      return raw ? (JSON.parse(raw) as AccountSnapshot) : null;
    } catch {
      return null;
    }
  }

  async function saveSnapshot(user: CyKromeUser, ownerships: Ownership[]): Promise<void> {
    const snapshot: AccountSnapshot = { user, ownerships, proProductId, savedAt: Date.now() };
    await host.storage.write(SNAPSHOT_KEY, JSON.stringify(snapshot)).catch(() => {});
  }

  // ---- sync bookkeeping ----

  async function loadMeta(): Promise<SyncMeta> {
    if (meta) return meta;
    let saved: SyncMeta | null = null;
    try {
      const raw = await host.storage.read(SYNC_KEY);
      saved = raw ? (JSON.parse(raw) as SyncMeta) : null;
    } catch {
      saved = null;
    }
    // A device that never synced stamps what it has as older than any real edit, so the first
    // sync adds its favourites to the account without undoing removals made elsewhere.
    meta = saved ?? { userId: null, library: stamp(EMPTY_LIBRARY, host.library(), PRE_SYNC_STAMP), revision: null };
    // Edits made since the last save (or before the meta loaded) are stamped now.
    meta.library = stamp(meta.library, host.library());
    return meta;
  }

  function saveMeta(): void {
    if (meta) void host.storage.write(SYNC_KEY, JSON.stringify(meta)).catch(() => {});
  }

  function onLocalChange(): void {
    if (!meta) return;
    const next = stamp(meta.library, host.library());
    if (sameLibrary(next, meta.library)) return;
    meta.library = next;
    saveMeta();
    schedulePush();
  }

  function schedulePush(): void {
    clearTimeout(pushTimer);
    if (!isPro()) return;
    pushTimer = setTimeout(() => void syncNow(), pushDelayMs);
  }

  /** Merge this device's library with the account's. A no-op without Pro. */
  async function syncNow(): Promise<void> {
    if (syncing) return syncing;
    if (!isPro() || host.account().offline) return;
    syncing = (async () => {
      const user = host.account().user!;
      const m = await loadMeta();
      if (m.userId !== user.id) {
        // Another account synced here before: start this one from what the device shows now.
        m.userId = user.id;
        m.revision = null;
      }
      setSync({ state: 'syncing', error: null });
      try {
        const result = await syncLibrary(client, m.library);
        // Keep edits made while the request was in flight: they are stamped newer, so they win.
        m.library = mergeLibraries(m.library, result.library);
        m.revision = result.revision;
        saveMeta();
        host.setLibrary(apply(host.library(), m.library));
        setSync({ state: 'idle', lastSyncedAt: Date.now(), error: null });
        if (!sameLibrary(m.library, result.library)) schedulePush();
      } catch (err) {
        if (err instanceof AccountApiError && err.isAuthFailure && err.status === 401) {
          await signOut();
          return;
        }
        // 403 here means the server no longer sees Pro; the next plan refresh will agree.
        setSync({ state: 'error', error: messageOf(err) });
      }
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  }

  // ---- plan ----

  async function resolveProductId(): Promise<string | null> {
    if (!proProductId) proProductId = await client.productId(proSlug);
    return proProductId;
  }

  async function applyOwnerships(ownerships: Ownership[]): Promise<void> {
    const productId = await resolveProductId();
    const plan = resolvePlan(ownerships, productId ?? '');
    host.setAccount({ offline: false, planError: null });
    host.setPlan(plan);
    const user = host.account().user;
    if (user) await saveSnapshot(user, ownerships);
    if (plan.plan === 'pro') {
      await loadMeta();
      void syncNow();
    } else {
      clearTimeout(pushTimer);
      setSync({ state: 'off', error: null });
    }
  }

  async function refreshPlan(): Promise<void> {
    try {
      await applyOwnerships(await client.ownerships());
    } catch (err) {
      if (err instanceof AccountApiError && err.isAuthFailure) return void (await signOut());
      // Keep the last known plan: a flaky network must not downgrade anyone mid-session.
      host.setAccount({ planError: messageOf(err), offline: isUnreachable(err) });
    }
  }

  // ---- session ----

  async function signedIn(user: CyKromeUser): Promise<void> {
    host.setAccount({ status: 'signedIn', user, offline: false, planError: null });
    await refreshPlan();
  }

  async function restore(): Promise<void> {
    host.setAccount({ status: 'restoring' });
    try {
      const user = await client.restore();
      if (!user) {
        await host.storage.remove(SNAPSHOT_KEY).catch(() => {});
        host.setAccount({ status: 'signedOut', user: null });
        return;
      }
      await signedIn(user);
    } catch (err) {
      const snapshot = isUnreachable(err) ? await readSnapshot() : null;
      if (snapshot) {
        // Offline at launch with a saved session: carry on as that account. The plan comes from
        // the saved ownerships, which still expire on time.
        proProductId = proProductId ?? snapshot.proProductId;
        host.setAccount({ status: 'signedIn', user: snapshot.user, offline: true, planError: messageOf(err) });
        host.setPlan(resolvePlan(snapshot.ownerships, proProductId ?? ''));
      } else {
        // Keep the token: the next launch with a connection signs straight back in.
        host.setAccount({ status: 'signedOut', planError: messageOf(err) });
      }
    }
  }

  async function signOut(): Promise<void> {
    clearTimeout(pushTimer);
    await client.signOut();
    await host.storage.remove(SNAPSHOT_KEY).catch(() => {});
    host.setAccount({ status: 'signedOut', user: null, offline: false, planError: null, sync: INITIAL_ACCOUNT.sync });
    host.setPlan(FREE_PLAN);
  }

  host.onLibraryChange(onLocalChange);

  return {
    restore,
    refreshPlan,
    syncNow,
    signOut,
    async signInWithPassword(email: string, password: string) {
      await signedIn((await client.signInWithPassword(email.trim(), password)).user);
    },
    requestCode: (email: string) => client.requestCode(email.trim()),
    async signInWithCode(email: string, code: string) {
      await signedIn((await client.signInWithCode(email.trim(), code.trim())).user);
    },
    /** Creates the account and emails a code; finish with signInWithCode. */
    signUp: (details: SignUpDetails) => client.signUp(details),
    /** After a store purchase is reported, CDS answers with the new ownerships. */
    applyOwnerships,
    /** Desktop: the online payment page for Drift Pro. */
    checkoutUrl: () => client.startCheckout(proSlug),
    offerings: () => client.offerings(proSlug),
  };
}

export type DriftSession = ReturnType<typeof createSession>;
