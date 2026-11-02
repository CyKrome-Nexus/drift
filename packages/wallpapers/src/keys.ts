// Bring your own keys.
//
// Drift ships with no stock-video API keys. Each person creates their own free keys with the
// providers and pastes them into Drift (the welcome screen, or Settings › Wallpaper sources), so
// every request is that person's own, under their own account and quota: personal use. The apps
// keep the keys in the OS credential store (desktop) or Secure Store (phone), never in the build.
//
// A key set at build time (WALLPAPER_PROVIDERS / PEXELS_API_KEY in .env) still works, for
// development; a key the user saved wins over it.

import type { WallpaperConfig } from './config';
import type { Fetch } from './types';

export type KeyedProvider = 'pexels' | 'pixabay';

export type ProviderKeys = Partial<Record<KeyedProvider, string>>;

export interface KeyProviderInfo {
  name: KeyedProvider;
  label: string;
  /** One line on what it brings. */
  what: string;
  /** The free plan's limit, as the provider states it. */
  limits: string;
  /** Where a signed-in person creates or reads their key. */
  keyUrl: string;
  /** What to do there, in order. */
  steps: readonly string[];
}

/** The providers Drift asks people to bring a key for, in the order the welcome screen shows them. */
export const KEY_PROVIDERS: readonly KeyProviderInfo[] = [
  {
    name: 'pexels',
    label: 'Pexels',
    what: 'The largest free library of stock video, with tall loops for phones.',
    limits: '200 requests an hour, free',
    keyUrl: 'https://www.pexels.com/api/new/',
    steps: ['Sign up or log in to Pexels.', 'Fill in the short form (a personal project is fine) and accept the terms.', 'Copy your API key and paste it here.'],
  },
  {
    name: 'pixabay',
    label: 'Pixabay',
    what: 'Free stock video, strongest on nature, backgrounds and abstract motion.',
    limits: '100 requests a minute, free',
    keyUrl: 'https://pixabay.com/api/docs/',
    steps: ['Sign up or log in to Pixabay.', 'On the API documentation page, find “Your API key” under Parameters.', 'Copy it and paste it here.'],
  },
];

export function isKeyedProvider(name: string): name is KeyedProvider {
  return KEY_PROVIDERS.some((p) => p.name === name);
}

/** Keys as pasted: trimmed, and empty ones dropped. */
export function cleanKeys(keys: ProviderKeys): ProviderKeys {
  const out: ProviderKeys = {};
  for (const p of KEY_PROVIDERS) {
    const k = keys[p.name]?.trim();
    if (k) out[p.name] = k;
  }
  return out;
}

/**
 * `config` with the user's keys over any from the build. A provider the user has a key for is
 * switched on even if the build's list left it out, ahead of the fallback.
 */
export function withKeys(config: WallpaperConfig, keys: ProviderKeys): WallpaperConfig {
  const own = cleanKeys(keys);
  const out: WallpaperConfig = { ...config, providers: [...config.providers] };
  for (const p of KEY_PROVIDERS) {
    const key = own[p.name];
    if (!key) continue;
    out[p.name] = { ...(config[p.name] ?? {}), apiKey: key };
    if (!out.providers.includes(p.name)) {
      const at = out.providers.indexOf('drift');
      out.providers.splice(at < 0 ? out.providers.length : at, 0, p.name);
    }
  }
  return out;
}

export type KeyCheck = 'ok' | 'invalid' | 'unreachable';

/**
 * Whether `key` works, with one small request. Pexels answers 401/403 for a bad key, Pixabay 400;
 * anything else that fails (offline, 5xx, rate limited) is "unreachable", not a verdict on the key.
 */
export async function verifyKey(provider: KeyedProvider, key: string, fetch: Fetch): Promise<KeyCheck> {
  const k = key.trim();
  if (!k) return 'invalid';
  try {
    if (provider === 'pexels') {
      const res = await fetch('https://api.pexels.com/videos/popular?per_page=1', { headers: { Authorization: k } });
      if (res.ok) return 'ok';
      return res.status === 401 || res.status === 403 ? 'invalid' : 'unreachable';
    }
    const res = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(k)}&per_page=3`);
    if (res.ok) return 'ok';
    return res.status === 400 || res.status === 401 || res.status === 403 ? 'invalid' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
