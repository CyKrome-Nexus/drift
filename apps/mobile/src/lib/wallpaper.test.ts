import { describe, expect, it, vi } from 'vitest';
import { catalog } from '@drift/core';
import { native } from '../test/fakes';

async function fresh() {
  vi.resetModules();
  const store = await import('./store');
  const wallpaper = await import('./wallpaper');
  return { ...store, ...wallpaper };
}

const free = catalog().find((w) => w.tier === 'free')!;
const pro = catalog().find((w) => w.tier === 'pro')!;

describe('phone wallpaper actions', () => {
  it('opens the upgrade sheet for a Pro wallpaper on a free account', async () => {
    const { applyWallpaper, getState } = await fresh();
    applyWallpaper(pro);
    expect(native.routes).toEqual(['/upgrade']);
    expect(getState().upgradeFeature).toBe('proWallpapers');
    expect(getState().toast).toBeNull();
  });

  it('says honestly that nothing was applied yet on iOS', async () => {
    const { applyWallpaper, getState, updateSettings } = await fresh();
    updateSettings({ applyTarget: 'Lock' });
    applyWallpaper(free);
    expect(getState().toast).toMatchObject({ tone: 'info' });
    expect(getState().toast?.text).toContain('lock screen');
    expect(getState().toast?.text).toContain('Live Photo export not built yet');
  });

  it('says honestly that nothing was applied yet on Android', async () => {
    native.os = 'android';
    const { applyWallpaper, getState } = await fresh();
    applyWallpaper(free);
    expect(getState().toast?.text).toContain('home & lock screen');
    expect(getState().toast?.text).toContain('live wallpaper service not built yet');
  });

  it('gates Pro downloads the same way', async () => {
    const { downloadWallpaper } = await fresh();
    downloadWallpaper(pro);
    expect(native.routes).toEqual(['/upgrade']);
  });
});
