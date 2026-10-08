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

  it('iOS: saves a Live Photo and opens the Settings › Wallpaper guide', async () => {
    const { applyWallpaper, getState } = await fresh();
    await applyWallpaper(free);
    expect(JSON.parse(native.wallpaper.specs[0])).toMatchObject({ id: free.id, name: free.name });
    expect(native.routes).toEqual([`/live-photo?id=${free.id}`]);
    expect(getState().applying).toBeNull();
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
