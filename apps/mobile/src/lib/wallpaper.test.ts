import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MOBILE_SETTINGS, art, catalog } from '@drift/core';
import { native } from '../test/fakes';
import { DRIFT_MS, OVERSCAN_X, OVERSCAN_Y } from './motion';

async function fresh() {
  vi.resetModules();
  const store = await import('./store');
  const wallpaper = await import('./wallpaper');
  return { ...store, ...wallpaper };
}

const free = catalog().find((w) => w.tier === 'free')!;
const pro = catalog().find((w) => w.tier === 'pro')!;

describe('the spec the native wallpapers draw', () => {
  it('carries the portrait art, the app’s motion and the playback settings', async () => {
    const { nativeSpec } = await fresh();
    const spec = nativeSpec(free, { ...DEFAULT_MOBILE_SETTINGS, fps: '30', pauseLowPower: false });
    const { layers, base } = art(free, 'portrait');
    expect(spec).toEqual({
      id: free.id, name: free.name, base, layers,
      overscanX: OVERSCAN_X, overscanY: OVERSCAN_Y, driftMs: DRIFT_MS,
      fps: 30, pauseLowPower: false,
    });
  });
});

describe('phone wallpaper actions', () => {
  it('opens the upgrade sheet for a Pro wallpaper on a free account', async () => {
    const { applyWallpaper, getState } = await fresh();
    await applyWallpaper(pro);
    expect(native.routes).toEqual(['/upgrade']);
    expect(getState().upgradeFeature).toBe('proWallpapers');
    expect(getState().toast).toBeNull();
    expect(native.wallpaper.specs).toEqual([]);
  });

  it('says what is missing in Expo Go, which has no wallpaper module', async () => {
    native.wallpaper.available = false;
    const { applyWallpaper, getState } = await fresh();
    await applyWallpaper(free);
    expect(getState().toast).toMatchObject({ tone: 'info' });
    expect(getState().toast?.text).toContain('Expo Go');
  });

  it('iOS: saves a Live Photo, says what to tap, then opens Photos', async () => {
    vi.useFakeTimers();
    const { applyWallpaper, getState, PHOTOS_HINT_MS, PHOTOS_URL } = await fresh();
    const done = applyWallpaper(free);
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(native.wallpaper.specs[0])).toMatchObject({ id: free.id, name: free.name });
    expect(getState().toast?.text).toContain('Share › Use as Wallpaper');
    // The hint gets its moment before Drift leaves; the button stays busy meanwhile.
    expect(native.openedUrls).toEqual([]);
    expect(getState().applying).toBe(free.id);
    await vi.advanceTimersByTimeAsync(PHOTOS_HINT_MS);
    await done;
    expect(native.openedUrls).toEqual([PHOTOS_URL]);
    expect(native.routes).toEqual([]);
    expect(getState().applying).toBeNull();
    vi.useRealTimers();
  });

  it('iOS: shows the in-app guide when Photos will not open', async () => {
    vi.useFakeTimers();
    native.openUrlFails = true;
    const { applyWallpaper, PHOTOS_HINT_MS } = await fresh();
    const done = applyWallpaper(free);
    await vi.advanceTimersByTimeAsync(PHOTOS_HINT_MS);
    await done;
    expect(native.routes).toEqual([`/live-photo?id=${free.id}`]);
    vi.useRealTimers();
  });

  it('iOS experiment: with the shortcut on, runs it right after saving', async () => {
    const { applyWallpaper, getState, setState, SHORTCUT_RUN_URL } = await fresh();
    setState({ iosShortcut: true });
    await applyWallpaper(free);
    expect(SHORTCUT_RUN_URL).toBe('shortcuts://run-shortcut?name=Drift%20Wallpaper');
    expect(native.openedUrls).toEqual([SHORTCUT_RUN_URL]);
    expect(getState().toast?.text).toContain('with Shortcuts');
  });

  it('iOS experiment: falls back to Photos when Shortcuts will not open', async () => {
    vi.useFakeTimers();
    native.openUrlFails = true;
    const { applyWallpaper, setState, PHOTOS_HINT_MS } = await fresh();
    setState({ iosShortcut: true });
    const done = applyWallpaper(free);
    await vi.advanceTimersByTimeAsync(PHOTOS_HINT_MS);
    await done;
    // Photos fails too here, so the guide is the last resort.
    expect(native.routes).toEqual([`/live-photo?id=${free.id}`]);
    vi.useRealTimers();
  });

  it('remembers the shortcut experiment', async () => {
    const first = await fresh();
    first.setState({ iosShortcut: true });
    const again = await fresh();
    await again.loadPersisted();
    expect(again.getState().iosShortcut).toBe(true);
  });

  it('Android: opens the system preview the first time, naming the chosen screens', async () => {
    native.os = 'android';
    const { applyWallpaper, getState, updateSettings } = await fresh();
    updateSettings({ applyTarget: 'Lock' });
    await applyWallpaper(free);
    expect(native.wallpaper.specs).toHaveLength(1);
    expect(getState().toast).toMatchObject({ tone: 'info' });
    expect(getState().toast?.text).toContain('lock screen');
  });

  it('Android: swaps in place when Drift is already the live wallpaper', async () => {
    native.os = 'android';
    native.wallpaper.androidResult = 'applied';
    const { applyWallpaper, getState } = await fresh();
    await applyWallpaper(free);
    expect(getState().toast).toMatchObject({ tone: 'ok', text: `“${free.name}” is now your wallpaper` });
  });

  it('reports a native failure and is ready to try again', async () => {
    native.wallpaper.error = new Error('Drift needs permission to add photos');
    const { applyWallpaper, getState } = await fresh();
    await applyWallpaper(free);
    expect(getState().toast?.text).toContain('needs permission to add photos');
    expect(getState().applying).toBeNull();
    expect(native.routes).toEqual([]);
  });

  it('ignores a second tap while a wallpaper is being set', async () => {
    native.os = 'android';
    const { applyWallpaper } = await fresh();
    await Promise.all([applyWallpaper(free), applyWallpaper(free)]);
    expect(native.wallpaper.specs).toHaveLength(1);
  });

  it('gates Pro downloads the same way', async () => {
    const { downloadWallpaper } = await fresh();
    downloadWallpaper(pro);
    expect(native.routes).toEqual(['/upgrade']);
  });
});
