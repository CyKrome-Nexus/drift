import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MOBILE_SETTINGS } from '@drift/core';
import { FREE_PLAN } from '@drift/account';
import { native } from '../test/fakes';

async function freshStore() {
  vi.resetModules();
  return import('./store');
}

const KEY = 'drift.mobile.v1';

describe('phone store', () => {
  it('is not ready until saved state is loaded', async () => {
    const { getState, loadPersisted } = await freshStore();
    expect(getState().ready).toBe(false);
    await loadPersisted();
    expect(getState().ready).toBe(true);
    expect(getState().settings).toEqual(DEFAULT_MOBILE_SETTINGS);
  });

  it('treats unreadable storage as a fresh install', async () => {
    native.storage.set(KEY, '{not json');
    const { getState, loadPersisted } = await freshStore();
    await loadPersisted();
    expect(getState().ready).toBe(true);
    expect(getState().settings).toEqual(DEFAULT_MOBILE_SETTINGS);
  });

  it('remembers favourites and settings across launches', async () => {
    const first = await freshStore();
    await first.loadPersisted();
    first.toggleFav(11);
    first.updateSettings({ fps: '30' });

    const second = await freshStore();
    await second.loadPersisted();
    expect(second.getState().favs[0]).toBe(11);
    expect(second.getState().settings.fps).toBe('30');
  });

  it('ignores junk in saved favourites', async () => {
    native.storage.set(KEY, JSON.stringify({ favs: [1, 'x', null, 2] }));
    const { getState, loadPersisted } = await freshStore();
    await loadPersisted();
    expect(getState().favs).toEqual([1, 2]);
  });

  it('drops the Pro frame rate when the plan lapses', async () => {
    const { getState, setPlan, updateSettings } = await freshStore();
    setPlan({ plan: 'pro', expiresAt: null, source: 'purchase' });
    updateSettings({ fps: '120' });
    setPlan(FREE_PLAN);
    expect(getState().settings.fps).toBe(DEFAULT_MOBILE_SETTINGS.fps);
  });
});
