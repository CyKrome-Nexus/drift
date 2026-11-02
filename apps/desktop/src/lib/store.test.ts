import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '@drift/core';
import { FREE_PLAN } from '@drift/account';

// The store reads localStorage once, at import, so each test gets a fresh module.
async function freshStore() {
  vi.resetModules();
  return import('./store');
}

const KEY = 'drift.desktop.v1';

describe('desktop store', () => {
  beforeEach(() => localStorage.clear());

  it('starts on Home with defaults on a fresh install', async () => {
    const { getState } = await freshStore();
    const s = getState();
    expect(s.view).toEqual({ name: 'home' });
    expect(s.settings).toEqual(DEFAULT_DESKTOP_SETTINGS);
    expect(s.account.status).toBe('restoring');
    expect(s.current).toBeNull();
    expect(s.lastApplied).toBeNull();
  });

  it('treats unreadable storage as a fresh install', async () => {
    localStorage.setItem(KEY, '{not json');
    const { getState } = await freshStore();
    expect(getState().settings).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it('remembers favourites, settings and the last wallpaper across launches', async () => {
    const first = await freshStore();
    first.toggleFav('drift:3');
    first.updateSettings({ fps: '30' });
    first.setState({ lastApplied: { wallpaperId: 'drift:4', media: null, target: 'Desktop', displays: 'Same', fps: '30', muted: true } });

    const second = await freshStore();
    const s = second.getState();
    expect(s.favs[0]).toBe('drift:3');
    expect(s.settings.fps).toBe('30');
    expect(s.lastApplied?.wallpaperId).toBe('drift:4');
  });

  it('carries favourites, lists and the last wallpaper saved before providers over to drift: ids', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      favs: [6, 14, 'coverr:a', 99],
      lists: [{ id: 'w', name: 'Workspace', items: [6] }],
      lastApplied: { wallpaperId: 6, target: 'Desktop', displays: 'Same', fps: '60', muted: true },
      lastDisplays: [{ display: 'Main', wallpaperId: 2 }, { display: 'Side', wallpaperId: 'nope' }],
    }));
    const { getState } = await freshStore();
    const s = getState();
    expect(s.favs).toEqual(['drift:6', 'drift:14', 'coverr:a']);
    expect(s.lists).toEqual([{ id: 'w', name: 'Workspace', items: ['drift:6'] }]);
    expect(s.lastApplied).toMatchObject({ wallpaperId: 'drift:6', media: null });
    expect(s.lastDisplays).toEqual([{ display: 'Main', wallpaperId: 'drift:2' }]);
    // The generated set is always known, so those favourites still render.
    expect(s.known['drift:14'].name).toBe('Ember Lattice');
  });

  it('remembers provider wallpapers it has shown, across launches', async () => {
    vi.useFakeTimers();
    try {
      const first = await freshStore();
      const w = { ...first.getState().known['drift:0'], id: 'coverr:x', name: 'Rain' };
      first.remember([w]);
      first.toggleFav('coverr:x');
      vi.advanceTimersByTime(600);
      const second = await freshStore();
      expect(second.getState().known['coverr:x'].name).toBe('Rain');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not persist what the engine reports as running', async () => {
    const first = await freshStore();
    first.setState({ current: { id: 'drift:2', startedAtMs: 1, displays: [], paused: null } });
    const second = await freshStore();
    expect(second.getState().current).toBeNull();
  });

  it('finds where a wallpaper\'s loop is, on whichever display shows it', async () => {
    const { getState, liveSince, setState } = await freshStore();
    expect(liveSince(getState(), 'drift:2')).toBeUndefined();
    setState({
      current: {
        id: 'drift:5',
        startedAtMs: 500,
        displays: [
          { display: 'Main', wallpaperId: 'drift:5', startedAtMs: 500 },
          { display: 'Side', wallpaperId: 'coverr:2', startedAtMs: 200 },
        ],
        paused: null,
      },
    });
    expect(liveSince(getState(), 'coverr:2')).toBe(200);
    expect(liveSince(getState(), 'drift:5')).toBe(500);
    expect(liveSince(getState(), 'drift:9')).toBeUndefined();
  });

  it('toggles a favourite on and off', async () => {
    const { getState, toggleFav } = await freshStore();
    const before = getState().favs;
    toggleFav('coverr:99');
    expect(getState().favs).toEqual(['coverr:99', ...before]);
    toggleFav('coverr:99');
    expect(getState().favs).toEqual(before);
  });

  it('returns from detail and settings to where they were opened from', async () => {
    const { back, getState, go, openDetail, openSettings } = await freshStore();
    go({ name: 'browse', tab: 'Library' });
    openDetail('drift:5');
    openDetail('coverr:6'); // related wallpaper: still returns to Library, not to the first detail
    expect(getState().view).toMatchObject({ name: 'detail', id: 'coverr:6' });
    back();
    expect(getState().view).toEqual({ name: 'browse', tab: 'Library' });

    openSettings('About');
    openSettings('Account');
    back();
    expect(getState().view).toEqual({ name: 'browse', tab: 'Library' });
  });

  it('drops Pro-only settings when the plan lapses', async () => {
    const { getState, setPlan, updateSettings } = await freshStore();
    setPlan({ plan: 'pro', expiresAt: null, source: 'purchase' });
    updateSettings({ fps: 'Unlimited', monitors: 'Span' });
    expect(getState().settings).toMatchObject({ fps: 'Unlimited', monitors: 'Span' });

    setPlan(FREE_PLAN);
    expect(getState().settings.fps).toBe(DEFAULT_DESKTOP_SETTINGS.fps);
    expect(getState().settings.monitors).toBe(DEFAULT_DESKTOP_SETTINGS.monitors);
  });

  it('clears a toast after a few seconds', async () => {
    vi.useFakeTimers();
    try {
      const { getState, toast } = await freshStore();
      toast('Saved');
      expect(getState().toast?.text).toBe('Saved');
      vi.advanceTimersByTime(3000);
      expect(getState().toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
