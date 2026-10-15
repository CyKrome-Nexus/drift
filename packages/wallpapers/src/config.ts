// Which providers are on, from the build's environment — the way the CDS backend picks its
// storage and payment providers. Swapping or adding a provider is an env change:
//
//   WALLPAPER_PROVIDERS   Comma-separated, in priority order. Default: coverr,nasa,drift
//   COVERR_API_KEY        Coverr's key. Free (Demo) or paid (Production): same key, same API.
//   COVERR_API_URL        Optional; Coverr's own API unless testing.
//   NASA_ASSETS_URL       Optional; NASA's own asset host unless testing.
//
// Each app reads these with its bundler's prefix (VITE_ on the desktop, EXPO_PUBLIC_ on the
// phone). A provider listed without what it needs is skipped and reported (`skipped`), never
// fatal: the app still opens, on whatever providers remain, and Drift's generated wallpapers
// are always there to fall back on.
//
// Keys bundled into an app are visible to anyone who unpacks it. That is acceptable for free
// keys with per-key limits; paid keys belong on a Drift server, which becomes one more provider
// here and nothing else changes.

import { coverrProvider, type CoverrConfig } from './providers/coverr';
import { driftProvider } from './providers/drift';
import { nasaProvider, type NasaConfig } from './providers/nasa';
import type { ProviderContext, WallpaperProvider } from './types';

export const DEFAULT_PROVIDERS: readonly string[] = ['coverr', 'nasa', 'drift'];

export interface WallpaperConfig {
  /** Provider names in priority order. */
  providers: string[];
  coverr?: CoverrConfig;
  nasa?: NasaConfig;
}

type Factory = (config: WallpaperConfig, ctx: ProviderContext) => WallpaperProvider | { missing: string };

/** Every provider Drift knows. A new one is an adapter in providers/ and a line here. */
export const PROVIDER_FACTORIES: Record<string, Factory> = {
  coverr: (c, ctx) => (c.coverr?.apiKey ? coverrProvider(c.coverr, ctx) : { missing: 'COVERR_API_KEY' }),
  nasa: (c, ctx) => nasaProvider(c.nasa ?? {}, ctx),
  drift: () => driftProvider(),
};

/** Providers whose wallpapers only show where no other provider has any. */
export const FALLBACK_PROVIDERS: ReadonlySet<string> = new Set(['drift']);

/** The config in `env`, reading `<prefix>WALLPAPER_PROVIDERS` and so on. */
export function configFromEnv(env: Record<string, string | undefined>, prefix = ''): WallpaperConfig {
  const read = (k: string) => env[`${prefix}${k}`]?.trim() || undefined;
  const list = read('WALLPAPER_PROVIDERS');
  const providers = list ? list.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [...DEFAULT_PROVIDERS];
  const coverrKey = read('COVERR_API_KEY');
  return {
    providers: [...new Set(providers)],
    coverr: coverrKey ? { apiKey: coverrKey, baseUrl: read('COVERR_API_URL') } : undefined,
    nasa: { assetsUrl: read('NASA_ASSETS_URL') },
  };
}

export interface ResolvedProviders {
  providers: WallpaperProvider[];
  skipped: Array<{ name: string; reason: string }>;
}

export function resolveProviders(config: WallpaperConfig, ctx: ProviderContext): ResolvedProviders {
  const providers: WallpaperProvider[] = [];
  const skipped: ResolvedProviders['skipped'] = [];
  for (const name of config.providers) {
    const factory = PROVIDER_FACTORIES[name];
    if (!factory) {
      skipped.push({ name, reason: `unknown provider (known: ${Object.keys(PROVIDER_FACTORIES).join(', ')})` });
      continue;
    }
    const made = factory(config, ctx);
    if ('missing' in made) skipped.push({ name, reason: `${made.missing} is not set` });
    else providers.push(made);
  }
  // Never an empty app: the generated set is always the last resort.
  if (!providers.some((p) => p.name === 'drift')) providers.push(driftProvider());
  return { providers, skipped };
}
