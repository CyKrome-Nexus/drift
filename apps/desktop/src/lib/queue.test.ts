import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatedWallpapers } from '@drift/core';
import type { ApplyRequest } from './platform';

const engine = vi.hoisted(() => ({ applied: [] as ApplyRequest[], paused: [] as boolean[] }));

vi.mock('./platform', () => ({
  inTauri: true,
  applyWallpaper: vi.fn(async (req: ApplyRequest) => {
    engine.applied.push(req);
    return { live: true, note: null };
  }),
  setPaused: vi.fn(async (p: boolean) => void engine.paused.push(p)),
  setLockScreen: vi.fn(async () => {}),
  setLockScreenUrl: vi.fn(async () => {}),
}));
vi.mock('./catalog', () => ({ catalog: { used: vi.fn(async () => {}) }, resolve: vi.fn(async (w: unknown) => w) }));
vi.mock('./paint', () => ({ stillFrame: vi.fn(async () => new Uint8Array()) }));

async function fresh() {
  vi.resetModules();
  return { ...(await import('./store')), ...(await import('./queue')) };
}

const free = generatedWallpapers().filter((w) => w.tier === 'free').map((w) => w.id);
const pro = generatedWallpapers().find((w) => w.tier === 'pro')!.id;
const showing = (id: string) => ({ id, startedAtMs: 1, displays: [], paused: null, held: false });

beforeEach(() => {
  localStorage.clear();
  engine.applied = [];
  engine.paused = [];
});

describe('tray queue', () => {
  it('steps forward and back through a list, wrapping at the ends', async () => {
    const { step } = await fresh();
    const ids = ['a', 'b', 'c'];
    expect(step(ids, 'a', 1, false)).toBe('b');
    expect(step(ids, 'c', 1, false)).toBe('a');
    expect(step(ids, 'a', -1, false)).toBe('c');
    // Off the list: next starts at the top, previous at the bottom.
    expect(step(ids, 'z', 1, false)).toBe('a');
    expect(step(ids, null, -1, false)).toBe('c');
    expect(step(['a'], 'a', 1, false)).toBeNull();
  });

  it('shuffles onto any other wallpaper, never the one showing', async () => {
    const { step } = await fresh();
    expect(step(['a', 'b', 'c'], 'a', 1, true, () => 0)).toBe('b');
    expect(step(['a', 'b', 'c'], 'a', 1, true, () => 0.99)).toBe('c');
  });

  it('walks the played list, else favourites, else recents, skipping what the plan locks', async () => {
    const { getState, setState, queueOf } = await fresh();
    setState({ recents: [free[2], free[3]] });
    expect(queueOf(getState())).toMatchObject({ label: 'Recents', source: null, ids: [free[2], free[3]] });
    setState({ favs: [pro, free[0]] });
    expect(queueOf(getState())).toMatchObject({ label: 'Favourites', source: 'favs', ids: [free[0]] });
    setState({ lists: [{ id: 'w', name: 'Workspace', items: [free[1], free[4]] }], queue: 'list:w' });
    expect(queueOf(getState())).toMatchObject({ label: 'Workspace', source: 'list:w', ids: [free[1], free[4]] });
  });

  it('applies the next wallpaper to the desktop only', async () => {
    const { setState, next } = await fresh();
    setState({ favs: [free[0], free[1]], current: showing(free[0]) });
    await next();
    expect(engine.applied.map((r) => [r.wallpaperId, r.target])).toEqual([[free[1], 'Desktop']]);
  });

  it('goes back to what played before when shuffling', async () => {
    const { setState, previous } = await fresh();
    setState({ favs: free.slice(0, 4), shuffle: true, recents: [free[0], free[3]], current: showing(free[0]) });
    await previous();
    expect(engine.applied.map((r) => r.wallpaperId)).toEqual([free[3]]);
  });

  it('plays a list from its top and remembers it', async () => {
    const { getState, setState, play } = await fresh();
    setState({ lists: [{ id: 'w', name: 'Workspace', items: [free[2], free[1]] }] });
    await play('list:w');
    expect(getState().queue).toBe('list:w');
    expect(engine.applied.map((r) => r.wallpaperId)).toEqual([free[2]]);
  });

  it('pauses and resumes by hand', async () => {
    const { setState, togglePause } = await fresh();
    await togglePause();
    expect(engine.paused).toEqual([]);
    setState({ current: showing(free[0]) });
    await togglePause();
    setState({ current: { ...showing(free[0]), held: true } });
    await togglePause();
    expect(engine.paused).toEqual([true, false]);
  });

  it('"Reduce CPU/RAM" drops to 30 fps at Low and puts the old settings back', async () => {
    const { getState, updateSettings, toggleSaver, saving } = await fresh();
    updateSettings({ fps: '60', quality: 'Balanced' });
    toggleSaver();
    expect(getState().settings).toMatchObject({ fps: '30', quality: 'Low' });
    expect(saving(getState())).toBe(true);
    toggleSaver();
    expect(getState().settings).toMatchObject({ fps: '60', quality: 'Balanced' });
    expect(getState().saver).toBeNull();
  });
});
