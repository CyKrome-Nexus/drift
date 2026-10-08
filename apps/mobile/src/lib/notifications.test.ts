import { describe, expect, it, vi } from 'vitest';
import { catalog } from '@drift/core';
import { native } from '../test/fakes';

const SEEN_KEY = 'drift.mobile.seen.v1';

async function fresh() {
  vi.resetModules();
  const store = await import('./store');
  const notifications = await import('./notifications');
  return { ...store, ...notifications };
}

const all = catalog();
const creator = all[0].publisher;
const byCreator = all.filter((w) => w.publisher === creator);

/** Pretend the last check saw everything except `missing`. */
function seenAllBut(...missing: number[]) {
  native.storage.set(SEEN_KEY, JSON.stringify(all.map((w) => w.id).filter((id) => !missing.includes(id))));
}

describe('new from followed creators', () => {
  it('finds only unseen wallpapers by followed creators, and nothing on the first check', async () => {
    const { newFromFollowed } = await fresh();
    const other = all.find((w) => w.publisher !== creator)!;
    const unseen = new Set(all.map((w) => w.id).filter((id) => id !== byCreator[0].id && id !== other.id));
    expect(newFromFollowed(all, [creator], unseen).map((w) => w.id)).toEqual([byCreator[0].id]);
    expect(newFromFollowed(all, [creator], null)).toEqual([]);
  });

  it('notifies about a new wallpaper with a link to it', async () => {
    native.notifications.granted = true;
    seenAllBut(byCreator[0].id);
    const { checkFollowedCreators, setState, updateSettings } = await fresh();
    setState({ following: [creator] });
    updateSettings({ notifyFollowed: true });
    expect(await checkFollowedCreators()).toBe(1);
    expect(native.notifications.scheduled).toEqual([
      { title: `New from ${creator}`, body: `${byCreator[0].name} · ${byCreator[0].category}`, data: { wallpaperId: byCreator[0].id } },
    ]);
    // Seen now: the next check is quiet.
    expect(await checkFollowedCreators()).toBe(0);
  });

  it('only records the catalog on the first check, so the back catalog is never announced', async () => {
    native.notifications.granted = true;
    const { checkFollowedCreators, setState, updateSettings } = await fresh();
    setState({ following: [creator] });
    updateSettings({ notifyFollowed: true });
    expect(await checkFollowedCreators()).toBe(0);
    expect(JSON.parse(native.storage.get(SEEN_KEY)!)).toHaveLength(all.length);
  });

  it('stays quiet with the setting off, and still marks things seen', async () => {
    native.notifications.granted = true;
    seenAllBut(byCreator[0].id);
    const { checkFollowedCreators, setState } = await fresh();
    setState({ following: [creator] });
    expect(await checkFollowedCreators()).toBe(0);
    expect(JSON.parse(native.storage.get(SEEN_KEY)!)).toContain(byCreator[0].id);
  });

  it('sums many new wallpapers up in one notification', async () => {
    native.notifications.granted = true;
    const creators = [...new Set(all.map((w) => w.publisher))];
    seenAllBut(...all.map((w) => w.id));
    const { checkFollowedCreators, setState, updateSettings } = await fresh();
    setState({ following: creators });
    updateSettings({ notifyFollowed: true });
    expect(await checkFollowedCreators()).toBe(all.length);
    expect(native.notifications.scheduled).toHaveLength(1);
    expect(native.notifications.scheduled[0].title).toBe(`${all.length} new wallpapers from creators you follow`);
  });

  it('asks for permission once, and reports a refusal', async () => {
    const { enableNotifications } = await fresh();
    expect(await enableNotifications()).toBe(false);
    expect(native.notifications.asked).toBe(1);
    native.notifications.canAskAgain = false;
    expect(await enableNotifications()).toBe(false);
    expect(native.notifications.asked).toBe(1);
    native.notifications.granted = true;
    expect(await enableNotifications()).toBe(true);
  });

  it('opens the wallpaper a tapped notification names', async () => {
    const { wallpaperFromResponse } = await fresh();
    const response = (data: Record<string, unknown>) => ({ notification: { request: { content: { data } } } }) as never;
    expect(wallpaperFromResponse(response({ wallpaperId: 7 }))).toBe(7);
    expect(wallpaperFromResponse(response({}))).toBeNull();
    expect(wallpaperFromResponse(null)).toBeNull();
  });
});

describe('following', () => {
  it('toggles a creator and remembers it', async () => {
    const { toggleFollow, getState } = await fresh();
    toggleFollow(creator);
    expect(getState().following).toEqual([creator]);
    await Promise.resolve();
    const again = await fresh();
    await again.loadPersisted();
    expect(again.getState().following).toEqual([creator]);
    again.toggleFollow(creator);
    expect(again.getState().following).toEqual([]);
  });
});
