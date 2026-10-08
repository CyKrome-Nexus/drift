import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '@drift/core';
import type { ApplyOutcome, ApplyRequest, Running } from './platform';

// The engine lives in Rust; these tests stand in for it.
const engine = vi.hoisted(() => ({
  inTauri: true,
  outcome: { live: true, note: null } as ApplyOutcome,
  running: null as Running | null,
  applied: [] as ApplyRequest[],
  listener: null as ((r: Running | null) => void) | null,
}));

vi.mock('./platform', () => ({
  get inTauri() { return engine.inTauri; },
  applyWallpaper: vi.fn(async (req: ApplyRequest) => { engine.applied.push(req); return engine.outcome; }),
  stopWallpaper: vi.fn(async () => {}),
  currentWallpaper: vi.fn(async () => engine.running),
  onWallpaperChanged: vi.fn((cb: (r: Running | null) => void) => { engine.listener = cb; return () => {}; }),
}));

async function fresh() {
  vi.resetModules();
  const store = await import('./store');
  const actions = await import('./actions');
  return { ...store, ...actions };
}

const free = catalog().find((w) => w.tier === 'free')!;
const pro = catalog().find((w) => w.tier === 'pro')!;

describe('desktop actions', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(engine, { inTauri: true, outcome: { live: true, note: null }, running: null, applied: [], listener: null });
  });

  it('applies a free wallpaper and remembers it', async () => {
    const { apply, getState } = await fresh();
    await apply(free, 'Desktop');
    expect(engine.applied).toEqual([
      expect.objectContaining({ wallpaperId: free.id, target: 'Desktop' }),
    ]);
    expect(getState().lastApplied?.wallpaperId).toBe(free.id);
    expect(getState().toast?.text).toContain('is now your wallpaper');
  });

  it('says so, and remembers nothing, when the engine could not show it', async () => {
    engine.outcome = { live: false, note: 'not built for linux yet' };
    const { apply, getState } = await fresh();
    await apply(free);
    expect(getState().lastApplied).toBeNull();
    expect(getState().toast).toMatchObject({ tone: 'info' });
    expect(getState().toast?.text).toContain('not built for linux yet');
  });

  it('asks a free account to upgrade instead of applying a Pro wallpaper', async () => {
    const { apply, getState } = await fresh();
    await apply(pro);
    expect(engine.applied).toEqual([]);
    expect(getState().upgrade).toEqual({ open: true, feature: 'proWallpapers' });
  });

  it('applies a Pro wallpaper on a Pro plan', async () => {
    const { apply, setPlan } = await fresh();
    setPlan({ plan: 'pro', expiresAt: null, source: 'purchase' });
    await apply(pro);
    expect(engine.applied).toHaveLength(1);
  });

  it('follows the engine: current wallpaper and its loop start', async () => {
    const { connectEngine, getState } = await fresh();
    await connectEngine();
    engine.listener!({ wallpaperId: 7, target: 'Desktop', displays: 'Same', fps: '60', muted: true, startedAtMs: 1234 });
    expect(getState().current).toEqual({ id: 7, startedAtMs: 1234 });
    engine.listener!(null);
    expect(getState().current).toBeNull();
  });

  it('joins a wallpaper that is already running instead of applying again', async () => {
    engine.running = { wallpaperId: 3, target: 'Desktop', displays: 'Same', fps: '60', muted: true, startedAtMs: 42 };
    const { connectEngine, getState } = await fresh();
    await connectEngine();
    expect(engine.applied).toEqual([]);
    expect(getState().current).toEqual({ id: 3, startedAtMs: 42 });
  });

  it('resumes the last wallpaper once, however often it is connected', async () => {
    localStorage.setItem('drift.desktop.v1', JSON.stringify({
      lastApplied: { wallpaperId: free.id, target: 'Desktop', displays: 'Same', fps: '60', muted: true },
    }));
    const { connectEngine } = await fresh();
    await Promise.all([connectEngine(), connectEngine()]);
    await connectEngine();
    expect(engine.applied).toHaveLength(1);
    expect(engine.applied[0].wallpaperId).toBe(free.id);
  });

  it('does not resume when "Resume last wallpaper" is off', async () => {
    localStorage.setItem('drift.desktop.v1', JSON.stringify({
      settings: { resumeOnStartup: false },
      lastApplied: { wallpaperId: free.id, target: 'Desktop', displays: 'Same', fps: '60', muted: true },
    }));
    const { connectEngine } = await fresh();
    await connectEngine();
    expect(engine.applied).toEqual([]);
  });

  it('does not resume a Pro wallpaper after the plan lapsed', async () => {
    localStorage.setItem('drift.desktop.v1', JSON.stringify({
      lastApplied: { wallpaperId: pro.id, target: 'Desktop', displays: 'Same', fps: '60', muted: true },
    }));
    const { connectEngine } = await fresh();
    await connectEngine();
    expect(engine.applied).toEqual([]);
  });

  it('does nothing with the engine in a plain browser', async () => {
    engine.inTauri = false;
    localStorage.setItem('drift.desktop.v1', JSON.stringify({
      lastApplied: { wallpaperId: free.id, target: 'Desktop', displays: 'Same', fps: '60', muted: true },
    }));
    const { connectEngine } = await fresh();
    await connectEngine();
    expect(engine.applied).toEqual([]);
  });
});
