import { beforeEach, describe, expect, it, vi } from 'vitest';

// The OS credential store lives in Rust (src-tauri/src/secrets.rs); this stands in for it.
const keychain = vi.hoisted(() => ({ keys: {} as Record<string, string>, calls: [] as string[] }));

vi.mock('./platform', () => ({ inTauri: true }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: { provider: string; key?: string }) => {
    keychain.calls.push(`${cmd} ${args.provider}`);
    if (cmd === 'provider_key_get') return keychain.keys[args.provider] ?? null;
    if (cmd === 'provider_key_set') keychain.keys[args.provider] = args.key!;
    if (cmd === 'provider_key_clear') delete keychain.keys[args.provider];
  }),
}));

async function fresh() {
  vi.resetModules();
  return import('./catalog');
}

const names = (c: { providers: ReadonlyArray<{ name: string }> }) => c.providers.map((p) => p.name);

describe('the user’s own provider keys', () => {
  beforeEach(() => {
    keychain.keys = {};
    keychain.calls = [];
    localStorage.clear();
  });

  it('ships with no keys: only Drift’s own wallpapers until the user adds one', async () => {
    const { catalog, loadKeys } = await fresh();
    await loadKeys();
    expect(names(catalog)).toEqual(['drift']);
  });

  it('reads saved keys from the keychain at startup and switches their providers on', async () => {
    keychain.keys = { pexels: 'pk' };
    const { catalog, loadKeys } = await fresh();
    await loadKeys();
    expect(names(catalog)).toEqual(['pexels', 'drift']);
    expect(keychain.calls).toEqual(['provider_key_get pexels', 'provider_key_get pixabay']);
  });

  it('saves a key to the keychain, uses it at once through the same catalog, and removes it', async () => {
    const { catalog, setKey } = await fresh();
    await setKey('pixabay', '  px  ');
    expect(keychain.keys.pixabay).toBe('px');
    expect(names(catalog)).toEqual(['pixabay', 'drift']);
    await setKey('pixabay', null);
    expect(keychain.keys.pixabay).toBeUndefined();
    expect(names(catalog)).toEqual(['drift']);
  });

  it('shows the welcome screen until it is answered, once', async () => {
    const first = await fresh();
    expect(first.onboarded()).toBe(false);
    first.finishOnboarding();
    expect((await fresh()).onboarded()).toBe(true);
  });
});
