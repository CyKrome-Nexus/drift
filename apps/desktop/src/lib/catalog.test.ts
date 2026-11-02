import { beforeEach, describe, expect, it, vi } from 'vitest';

// The OS credential store lives in Rust (src-tauri/src/secrets.rs); this stands in for it.
const keychain = vi.hoisted(() => ({ keys: {} as Record<string, string> }));

vi.mock('./platform', () => ({ inTauri: true }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: { connection: string; key?: string }) => {
    if (cmd === 'provider_key_get') return keychain.keys[args.connection] ?? null;
    if (cmd === 'provider_key_set') keychain.keys[args.connection] = args.key!;
    if (cmd === 'provider_key_clear') delete keychain.keys[args.connection];
  }),
}));

async function fresh() {
  vi.resetModules();
  return import('./catalog');
}

const providers = (c: { providers: ReadonlyArray<{ name: string }> }) => c.providers.map((p) => p.name);
const LIST = 'drift.desktop.connections.v1';

describe('wallpaper sources (connections)', () => {
  beforeEach(() => {
    keychain.keys = {};
    localStorage.clear();
  });

  it('ships with no keys: only Drift’s own wallpapers until the user adds a source', async () => {
    const { catalog, loadConnections } = await fresh();
    await loadConnections();
    expect(providers(catalog)).toEqual(['drift']);
  });

  it('adds sources with their own names and keys, and uses them at once through the same catalog', async () => {
    const { addConnection, catalog, loadConnections } = await fresh();
    await loadConnections();
    const work = await addConnection('pexels', '  Work account ', 'p1');
    await addConnection('pixabay', '', 'x1');
    expect(work).toMatchObject({ type: 'pexels', name: 'Work account' });
    expect(keychain.keys[work.id]).toBe('p1');
    expect(providers(catalog)).toEqual(['pexels', 'pixabay', 'drift']);
    // The list is remembered; the keys are not in it.
    const saved = JSON.parse(localStorage.getItem(LIST)!);
    expect(saved.map((c: { name: string }) => c.name)).toEqual(['Work account', 'Pixabay']);
    expect(JSON.stringify(saved)).not.toContain('p1');
  });

  it('renames, replaces a key and removes a source, and reads them back next launch', async () => {
    const first = await fresh();
    await first.loadConnections();
    const a = await first.addConnection('pexels', 'Pexels', 'old');
    const b = await first.addConnection('pexels', 'Pexels 2', 'second');
    first.renameConnection(a.id, 'Main');
    await first.replaceKey(a.id, 'new');
    await first.removeConnection(b.id);
    expect(keychain.keys).toEqual({ [a.id]: 'new' });

    const next = await fresh();
    await next.loadConnections();
    expect(providers(next.catalog)).toEqual(['pexels', 'drift']);
    expect(JSON.parse(localStorage.getItem(LIST)!)).toEqual([{ id: a.id, type: 'pexels', name: 'Main' }]);
  });

  it('carries over keys the first build kept one per provider', async () => {
    keychain.keys = { pexels: 'legacy' };
    const { catalog, loadConnections } = await fresh();
    await loadConnections();
    expect(providers(catalog)).toEqual(['pexels', 'drift']);
    const [c] = JSON.parse(localStorage.getItem(LIST)!);
    expect(c).toMatchObject({ type: 'pexels', name: 'Pexels' });
    expect(keychain.keys).toEqual({ [c.id]: 'legacy' });
  });

  it('shows the welcome screen until it is answered, once', async () => {
    const first = await fresh();
    expect(first.onboarded()).toBe(false);
    first.finishOnboarding();
    expect((await fresh()).onboarded()).toBe(true);
  });
});
