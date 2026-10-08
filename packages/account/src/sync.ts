// Drift library sync: favourites, lists and followed creators across devices (a Pro feature).
//
// Every favourite, list and followed creator is a last-writer-wins register stamped with the time
// it last changed on some device. A removal is a register that is off (or a list with
// `deletedAt`), so it beats an older add made elsewhere instead of being undone by it. Two
// libraries merge by keeping the newer register per key; that is commutative, so devices converge
// whatever order they sync in. CDS stores the merged library and refuses a write against a stale
// revision (409), on which the device re-reads, re-merges and retries.
//
// Registers are stamped when the user makes the change (`stamp`), not when sync runs, so an edit
// made offline on Monday does not beat one made online on Tuesday just because it synced later.

import { AccountApiError } from './types';
import type { AccountClient } from './client';

export interface Toggle {
  on: boolean;
  at: number;
}

export interface SyncedList {
  name: string;
  items: number[];
  at: number;
  deletedAt: number | null;
}

export interface Library {
  favs: Record<string, Toggle>;
  lists: Record<string, SyncedList>;
  following: Record<string, Toggle>;
}

/** What the apps keep in their stores. Order is meaningful there and preserved by `apply`. */
export interface LocalLibrary {
  favs: number[];
  lists: Array<{ id: string; name: string; items: number[] }>;
  following: string[];
}

export const EMPTY_LIBRARY: Library = { favs: {}, lists: {}, following: {} };

const sameItems = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function stampToggles(prev: Record<string, Toggle>, local: readonly string[], now: number): Record<string, Toggle> {
  const out = { ...prev };
  const present = new Set(local);
  local.forEach((key, i) => {
    // New entries are spaced a millisecond apart in list order, so a first sync keeps the order.
    if (!out[key]?.on) out[key] = { on: true, at: now - i };
  });
  for (const [key, t] of Object.entries(out)) if (t.on && !present.has(key)) out[key] = { on: false, at: now };
  return out;
}

/** Record the difference between the last stamped library and the app's current one. */
export function stamp(prev: Library, local: LocalLibrary, now = Date.now()): Library {
  const lists = { ...prev.lists };
  const present = new Set<string>();
  for (const l of local.lists) {
    present.add(l.id);
    const p = lists[l.id];
    if (!p || p.deletedAt !== null || p.name !== l.name || !sameItems(p.items, l.items)) {
      lists[l.id] = { name: l.name, items: [...l.items], at: now, deletedAt: null };
    }
  }
  for (const [id, p] of Object.entries(lists)) {
    if (p.deletedAt === null && !present.has(id)) lists[id] = { ...p, at: now, deletedAt: now };
  }
  return {
    favs: stampToggles(prev.favs, local.favs.map(String), now),
    lists,
    following: stampToggles(prev.following, local.following, now),
  };
}

/** Deterministic tie-break, so two devices holding equal-time registers still agree. */
function newer<T extends { at: number }>(a: T | undefined, b: T | undefined): T {
  if (!a) return b!;
  if (!b) return a;
  if (a.at !== b.at) return a.at > b.at ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeRecords<T extends { at: number }>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = newer(a[key], b[key]);
  return out;
}

export function mergeLibraries(a: Library, b: Library): Library {
  return {
    favs: mergeRecords(a.favs, b.favs),
    lists: mergeRecords(a.lists, b.lists),
    following: mergeRecords(a.following, b.following),
  };
}

export function sameLibrary(a: Library, b: Library): boolean {
  const canon = (l: Library) =>
    JSON.stringify([l.favs, l.lists, l.following].map((r) => Object.keys(r).sort().map((k) => [k, (r as Record<string, unknown>)[k]])));
  return canon(a) === canon(b);
}

/**
 * The app's view of a library. Entries the device already shows keep their place; favourites new
 * to this device go first (newest first, as a fresh tap would), new lists and creators go last.
 */
export function apply(local: LocalLibrary, lib: Library): LocalLibrary {
  const favOn = (id: string) => lib.favs[id]?.on ?? false;
  const kept = local.favs.filter((id) => favOn(String(id)));
  const keptSet = new Set(kept.map(String));
  const added = Object.entries(lib.favs)
    .filter(([id, t]) => t.on && !keptSet.has(id))
    .sort((x, y) => y[1].at - x[1].at)
    .map(([id]) => Number(id));

  const liveList = (id: string) => (lib.lists[id] && lib.lists[id].deletedAt === null ? lib.lists[id] : null);
  const lists = local.lists
    .filter((l) => liveList(l.id))
    .map((l) => ({ id: l.id, name: liveList(l.id)!.name, items: [...liveList(l.id)!.items] }));
  const listIds = new Set(lists.map((l) => l.id));
  const newLists = Object.entries(lib.lists)
    .filter(([id, l]) => l.deletedAt === null && !listIds.has(id))
    .sort((x, y) => x[1].at - y[1].at)
    .map(([id, l]) => ({ id, name: l.name, items: [...l.items] }));

  const following = local.following.filter((p) => lib.following[p]?.on);
  const followingSet = new Set(following);
  const newFollowing = Object.entries(lib.following)
    .filter(([p, t]) => t.on && !followingSet.has(p))
    .sort((x, y) => x[1].at - y[1].at)
    .map(([p]) => p);

  return { favs: [...added, ...kept], lists: [...lists, ...newLists], following: [...following, ...newFollowing] };
}

// ---- the round trip ----

export interface SyncResult {
  library: Library;
  revision: string;
}

/**
 * Read the account's library, merge in this device's, write the result back if it changed, and
 * return what both sides now hold. Retries a few times when another device writes in between.
 */
export async function syncLibrary(client: AccountClient, local: Library, attempts = 3): Promise<SyncResult> {
  for (let i = 0; ; i++) {
    const remote = await client.request<{ revision: string | null; library: Library }>('GET', '/api/v1/drift/library');
    const merged = mergeLibraries(local, remote.library ?? EMPTY_LIBRARY);
    if (remote.revision && sameLibrary(merged, remote.library)) return { library: merged, revision: remote.revision };
    try {
      const { revision } = await client.request<{ revision: string }>('PUT', '/api/v1/drift/library', {
        body: { revision: remote.revision, library: merged },
      });
      return { library: merged, revision };
    } catch (err) {
      if (err instanceof AccountApiError && err.status === 409 && i + 1 < attempts) continue;
      throw err;
    }
  }
}
