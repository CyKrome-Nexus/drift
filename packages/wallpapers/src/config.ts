// Which providers are on, from the build's environment — the way the CDS backend picks its
// storage and payment providers. Swapping or adding a provider is an env change:
//
//   WALLPAPER_PROVIDERS   Comma-separated, in priority order. Default: pexels,pixabay,drift
//   PEXELS_API_KEY        Pexels' key (free: 200 requests an hour).
//   PIXABAY_API_KEY       Pixabay's key (free: 100 requests a minute).
//   COVERR_API_KEY        Coverr's key, for `coverr`. Free (Demo) or paid (Production).
//   COVERR_API_URL        Optional; Coverr's own API unless testing.
//   NASA_ASSETS_URL       Optional; NASA's own asset host unless testing (`nasa` needs no key).
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
import { pexelsProvider, type PexelsConfig } from './providers/pexels';
import { pixabayProvider, type PixabayConfig } from './providers/pixabay';
import type { ProviderContext, WallpaperProvider } from './types';

export const DEFAULT_PROVIDERS: readonly string[] = ['pexels', 'pixabay', 'drift'];

export interface WallpaperConfig {
  /** Provider names in priority order. */
  providers: string[];
  pexels?: PexelsConfig;
  pixabay?: PixabayConfig;
  coverr?: CoverrConfig;
  nasa?: NasaConfig;
}

type Factory = (config: WallpaperConfig, ctx: ProviderContext) => WallpaperProvider | { missing: string };

/** Every provider Drift knows. A new one is an adapter in providers/ and a line here. */
export const PROVIDER_FACTORIES: Record<string, Factory> = {
  pexels: (c, ctx) => (c.pexels?.apiKey ? pexelsProvider(c.pexels, ctx) : { missing: 'PEXELS_API_KEY' }),
  pixabay: (c, ctx) => (c.pixabay?.apiKey ? pixabayProvider(c.pixabay, ctx) : { missing: 'PIXABAY_API_KEY' }),
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
  const pexelsKey = read('PEXELS_API_KEY');
  const pixabayKey = read('PIXABAY_API_KEY');
  return {
    providers: [...new Set(providers)],
    pexels: pexelsKey ? { apiKey: pexelsKey } : undefined,
    pixabay: pixabayKey ? { apiKey: pixabayKey } : undefined,
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
