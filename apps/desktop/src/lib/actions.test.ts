import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatedWallpapers, type Wallpaper } from '@drift/core';
import type { ApplyOutcome, ApplyRequest, Running } from './platform';

// The engine lives in Rust; these tests stand in for it.
const engine = vi.hoisted(() => ({
  inTauri: true,
  outcome: { live: true, note: null } as ApplyOutcome,
  running: null as Running | null,
  applied: [] as ApplyRequest[],
  listener: null as ((r: Running | null) => void) | null,
  lockError: null as string | null,
  locked: 0,
  lockUrls: [] as string[],
  downloads: [] as Array<{ url: string; dir: string; name: string; ext: string }>,
  used: [] as string[],
}));

vi.mock('./platform', () => ({
  get inTauri() { return engine.inTauri; },
  applyWallpaper: vi.fn(async (req: ApplyRequest) => { engine.applied.push(req); return engine.outcome; }),
  stopWallpaper: vi.fn(async () => {}),
  currentWallpaper: vi.fn(async () => engine.running),
  onWallpaperChanged: vi.fn((cb: (r: Running | null) => void) => { engine.listener = cb; return () => {}; }),
  setLockScreen: vi.fn(async () => {
    if (engine.lockError) throw new Error(engine.lockError);
    engine.locked++;
  }),
  setLockScreenUrl: vi.fn(async (url: string) => {
    engine.lockUrls.push(url);
  }),
  downloadFile: vi.fn(async (url: string, dir: string, name: string, ext: string) => {
    engine.downloads.push({ url, dir, name, ext });
    return `${dir}/${name}.${ext}`;
  }),
  revealFile: vi.fn(async () => {}),
}));

// Providers are not called: `resolve` hands back the wallpaper with its full file list.
vi.mock('./catalog', () => ({
  catalog: { used: vi.fn(async (w: { id: string }) => void engine.used.push(w.id)) },
  resolve: vi.fn(async (w: Wallpaper) => w),
}));

// Canvas painting isn't available under jsdom; the bytes don't matter here.
vi.mock('./paint', () => ({ stillFrame: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

function running(over: Partial<Running> = {}): Running {
  return { wallpaperId: 'drift:7', media: null, target: 'Desktop', displays: 'Same', fps: '60', muted: true, startedAtMs: 1234, assignments: [], paused: null, ...over };
}

async function fresh() {
  vi.resetModules();
  const store = await import('./store');
  const actions = await import('./actions');
  return { ...store, ...actions };
}

const free = generatedWallpapers().find((w) => w.tier === 'free')!;
const pro = generatedWallpapers().find((w) => w.tier === 'pro')!;
/** A provider's wallpaper: a real video, with a poster for lock screens. */
const video: Wallpaper = {
  ...free,
  id: 'coverr:abc',
  name: 'Rain on Glass',
  publisher: 'Coverr',
  media: {
    kind: 'video',
    poster: 'https://storage.coverr.co/p/abc',
    thumbnail: 'https://storage.coverr.co/t/abc',
    preview: 'https://storage.coverr.co/videos/abc/preview',
    files: [{ url: 'https://storage.coverr.co/videos/abc', width: 3840, height: 2160, type: 'video/mp4' }],
    durationMs: 12_000,
  },
  credit: { provider: 'Coverr', providerUrl: 'https://coverr.co', author: null, authorUrl: null, sourceUrl: null, license: 'Coverr License' },
};

describe('desktop actions', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(engine, { inTauri: true, outcome: { live: true, note: null }, running: null, applied: [], listener: null, lockError: null, locked: 0, lockUrls: [], downloads: [], used: [] });
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
    await apply(free, 'Desktop');
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

  it('follows the engine: current wallpaper, its loop start, each display and why it is paused', async () => {
    const { connectEngine, getState } = await fresh();
    await connectEngine();
    const displays = [{ display: 'Monitor #1', wallpaperId: 'drift:7', startedAtMs: 1234 }];
    engine.listener!(running({ assignments: displays, paused: 'On battery power' }));
    expect(getState().current).toEqual({ id: 'drift:7', startedAtMs: 1234, displays, paused: 'On battery power' });
    engine.listener!(null);
    expect(getState().current).toBeNull();
  });

  it('joins a wallpaper that is already running instead of applying again', async () => {
    engine.running = running({ wallpaperId: 'drift:3', startedAtMs: 42 });
    const { connectEngine, getState } = await fresh();
    await connectEngine();
    expect(engine.applied).toEqual([]);
    expect(getState().current).toMatchObject({ id: 'drift:3', startedAtMs: 42 });
  });

  it('sends the chosen display with a per-display apply', async () => {
    const { apply, updateSettings, setPlan } = await fresh();
    setPlan({ plan: 'pro', expiresAt: null, source: 'purchase' });
    updateSettings({ monitors: 'Per display' });
    await apply(free, 'Desktop', 'Monitor #2');
    expect(engine.applied[0]).toMatchObject({ displays: 'Per display', display: 'Monitor #2' });
  });

  it('remembers each display\'s wallpaper and resumes them one by one', async () => {
    const first = await fresh();
    first.setPlan({ plan: 'pro', expiresAt: null, source: 'purchase' });
    first.updateSettings({ monitors: 'Per display' });
    await first.connectEngine();
    engine.listener!(running({
      displays: 'Per display',
      assignments: [
        { display: 'Monitor #1', wallpaperId: free.id, startedAtMs: 1 },
        { display: 'Monitor #2', wallpaperId: pro.id, startedAtMs: 2 },
      ],
    }));
    // Quitting stops the engine; the choices stay for the next launch.
    engine.listener!(null);
    expect(first.getState().lastDisplays).toHaveLength(2);

    engine.applied = [];
    const second = await fresh();
    await second.connectEngine();
    // The plan isn't restored in this test, so the Pro wallpaper is not resumed.
    expect(engine.applied).toEqual([expect.objectContaining({ wallpaperId: free.id, display: 'Monitor #1', displays: 'Per display' })]);
  });

  it('sets the lock screen as a still frame, alongside the desktop', async () => {
    const { apply, getState } = await fresh();
    await apply(free, 'Both');
    expect(engine.applied).toHaveLength(1);
    expect(engine.locked).toBe(1);
    expect(getState().toast?.text).toContain('is now your wallpaper and lock screen');
  });

  it('leaves the desktop alone for "Lock screen" only', async () => {
    const { apply, getState } = await fresh();
    await apply(free, 'Lock screen');
    expect(engine.applied).toEqual([]);
    expect(getState().lastApplied).toBeNull();
    expect(getState().toast?.text).toContain('is now your lock screen');
  });

  it('says why the lock screen was not set, without losing the desktop', async () => {
    engine.lockError = 'macOS does not allow apps to change the lock screen';
    const { apply, getState } = await fresh();
    await apply(free, 'Both');
    expect(getState().lastApplied?.wallpaperId).toBe(free.id);
    expect(getState().toast).toMatchObject({ tone: 'ok' });
    expect(getState().toast?.text).toContain('is now your wallpaper · macOS does not allow');
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

  it('sends a provider’s video to the engine, sets the lock screen from its poster, and tells the provider', async () => {
    const { apply, getState } = await fresh();
    await apply(video, 'Both');
    expect(engine.applied[0]).toMatchObject({ wallpaperId: 'coverr:abc', media: video.media });
    expect(engine.lockUrls).toEqual(['https://storage.coverr.co/p/abc']);
    expect(engine.locked).toBe(0);
    expect(engine.used).toEqual(['coverr:abc']);
    expect(getState().toast?.text).toContain('is now your wallpaper and lock screen');
  });

  it('does not tell the provider about a wallpaper that never reached the screen', async () => {
    engine.outcome = { live: false, note: 'engine offline' };
    const { apply } = await fresh();
    await apply(video, 'Desktop');
    expect(engine.used).toEqual([]);
  });

  it('downloads a provider’s file into the download folder, and only real files', async () => {
    const { download, getState } = await fresh();
    await download(video);
    expect(engine.downloads).toEqual([{ url: 'https://storage.coverr.co/videos/abc', dir: getState().settings.downloadDir, name: 'Rain on Glass', ext: 'mp4' }]);
    expect(engine.used).toEqual(['coverr:abc']);
    await download(free);
    expect(engine.downloads).toHaveLength(1);
    expect(getState().toast?.text).toContain('no file to save');
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
