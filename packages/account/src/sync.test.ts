import { describe, expect, it } from 'vitest';
import {
  AccountClient,
  EMPTY_LIBRARY,
  apply,
  memoryTokenStore,
  mergeLibraries,
  sameLibrary,
  stamp,
  syncLibrary,
  type Library,
  type LocalLibrary,
} from './index';

const local = (o: Partial<LocalLibrary> = {}): LocalLibrary => ({ favs: [], lists: [], following: [], ...o });

describe('stamp', () => {
  it('stamps new entries in order and leaves unchanged ones alone', () => {
    const a = stamp(EMPTY_LIBRARY, local({ favs: [3, 1], following: ['Mira'] }), 1000);
    expect(a.favs).toEqual({ '3': { on: true, at: 1000 }, '1': { on: true, at: 999 } });
    const b = stamp(a, local({ favs: [3, 1], following: ['Mira'] }), 2000);
    expect(b).toEqual(a);
  });

  it('turns removals into off registers and deleted lists', () => {
    const a = stamp(EMPTY_LIBRARY, local({ favs: [3], lists: [{ id: 'l', name: 'L', items: [3] }] }), 1000);
    const b = stamp(a, local(), 2000);
    expect(b.favs['3']).toEqual({ on: false, at: 2000 });
    expect(b.lists.l).toMatchObject({ deletedAt: 2000, at: 2000 });
  });

  it('restamps a list when its name or items change', () => {
    const a = stamp(EMPTY_LIBRARY, local({ lists: [{ id: 'l', name: 'L', items: [3] }] }), 1000);
    expect(stamp(a, local({ lists: [{ id: 'l', name: 'L', items: [3, 4] }] }), 2000).lists.l.at).toBe(2000);
    expect(stamp(a, local({ lists: [{ id: 'l', name: 'M', items: [3] }] }), 2000).lists.l.at).toBe(2000);
  });
});

describe('merge', () => {
  const phone = stamp(EMPTY_LIBRARY, local({ favs: [1, 2], following: ['Mira'] }), 1000);
  const desktop = stamp(stamp(EMPTY_LIBRARY, local({ favs: [2, 5] }), 500), local({ favs: [5] }), 1500);

  it('keeps the newer register per key, so a later removal wins', () => {
    const m = mergeLibraries(phone, desktop);
    expect(m.favs['2']).toEqual({ on: false, at: 1500 });
    expect(m.favs['1'].on).toBe(true);
    expect(m.favs['5'].on).toBe(true);
  });

  it('is commutative, associative and idempotent', () => {
    const third: Library = { ...EMPTY_LIBRARY, favs: { '2': { on: true, at: 1500 } } };
    expect(sameLibrary(mergeLibraries(phone, desktop), mergeLibraries(desktop, phone))).toBe(true);
    expect(sameLibrary(mergeLibraries(mergeLibraries(phone, desktop), third), mergeLibraries(phone, mergeLibraries(desktop, third)))).toBe(true);
    expect(sameLibrary(mergeLibraries(desktop, third), mergeLibraries(third, desktop))).toBe(true);
    const m = mergeLibraries(phone, desktop);
    expect(sameLibrary(mergeLibraries(m, m), m)).toBe(true);
  });
});

describe('apply', () => {
  it('keeps the device’s order and puts newly synced favourites first', () => {
    const lib: Library = {
      favs: { '1': { on: true, at: 1 }, '2': { on: true, at: 2 }, '7': { on: true, at: 9 }, '8': { on: true, at: 5 }, '3': { on: false, at: 9 } },
      lists: { a: { name: 'A2', items: [7], at: 3, deletedAt: null }, b: { name: 'B', items: [], at: 4, deletedAt: null }, c: { name: 'C', items: [], at: 4, deletedAt: 5 } },
      following: { Mira: { on: true, at: 1 } },
    };
    const out = apply(local({ favs: [2, 3, 1], lists: [{ id: 'c', name: 'C', items: [] }, { id: 'a', name: 'A', items: [] }] }), lib);
    expect(out.favs).toEqual([7, 8, 2, 1]);
    expect(out.lists).toEqual([{ id: 'a', name: 'A2', items: [7] }, { id: 'b', name: 'B', items: [] }]);
    expect(out.following).toEqual(['Mira']);
  });

  it('round-trips: applying a library stamped from the same view changes nothing', () => {
    const view = local({ favs: [4, 2], lists: [{ id: 'x', name: 'X', items: [4] }], following: ['A', 'B'] });
    const lib = stamp(EMPTY_LIBRARY, view, 1000);
    expect(apply(view, lib)).toEqual(view);
    expect(stamp(lib, apply(view, lib), 2000)).toEqual(lib);
  });
});

/** A CDS library endpoint with the real revision protocol, and a hook to slip in another device's write. */
function fakeServer() {
  let stored: { revision: string; library: Library } | null = null;
  let n = 0;
  let beforePut: (() => void) | null = null;
  const writes: Library[] = [];
  const write = (library: Library) => {
    stored = { revision: String(++n).padStart(32, '0'), library };
    writes.push(library);
    return stored.revision;
  };
  const fetch = (async (url: string, init: RequestInit) => {
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
    if (!new URL(url).pathname.endsWith('/drift/library')) return json(404, {});
    if (init.method === 'GET') return json(200, stored ?? { revision: null, library: EMPTY_LIBRARY });
    const body = JSON.parse(init.body as string);
    if (beforePut) {
      const hook = beforePut;
      beforePut = null;
      hook();
    }
    if ((stored?.revision ?? null) !== body.revision) return json(409, { message: 'moved on' });
    return json(200, { revision: write(body.library) });
  }) as typeof globalThis.fetch;
  return { fetch, writes, write, setBeforePut: (f: () => void) => (beforePut = f), get stored() { return stored; } };
}

describe('syncLibrary', () => {
  const client = (fetch: typeof globalThis.fetch) =>
    new AccountClient({ baseUrl: 'https://cds.test', tokenStore: memoryTokenStore('t'), fetch });

  it('converges two devices through the server', async () => {
    const server = fakeServer();
    const phone = stamp(EMPTY_LIBRARY, local({ favs: [1] }), 1000);
    const desktop = stamp(EMPTY_LIBRARY, local({ favs: [2] }), 2000);
    await syncLibrary(client(server.fetch), phone);
    const d = await syncLibrary(client(server.fetch), desktop);
    const p = await syncLibrary(client(server.fetch), phone);
    expect(sameLibrary(d.library, p.library)).toBe(true);
    expect(apply(local(), p.library).favs).toEqual([2, 1]);
    expect(server.writes).toHaveLength(2);
  });

  it('re-reads and re-merges when another device writes in between', async () => {
    const server = fakeServer();
    server.setBeforePut(() => server.write(stamp(EMPTY_LIBRARY, local({ favs: [9] }), 3000)));
    const result = await syncLibrary(client(server.fetch), stamp(EMPTY_LIBRARY, local({ favs: [1] }), 1000));
    expect(Object.keys(result.library.favs).sort()).toEqual(['1', '9']);
    expect(server.stored!.revision).toBe(result.revision);
  });
});
