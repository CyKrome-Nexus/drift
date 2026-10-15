// NASA Image and Video Library — public-domain footage of Earth, the Sun and the planets.
//
// The library is mostly narrated features, interviews and news, which make poor wallpapers, so
// this provider does not search it live: it serves a hand-picked list of footage (PICKS), checked
// by hand to exist at NASA's conventional file paths. Lists cost no request; `get` reads the
// item's file manifest for the authoritative list.
//
// No API key. NASA media is generally not copyrighted; its guidelines ask that it never implies
// NASA endorses a product, so the credit says "NASA" and nothing more
// (https://www.nasa.gov/nasa-brand-center/images-and-media/).

import { initialsOf, loopLabel, resolutionLabel, type Category, type MediaFile, type Wallpaper } from '@drift/core';
import type { Feed, FeedPage, ProviderContext, WallpaperProvider } from '../types';

export interface NasaConfig {
  /** Asset host; NASA's own unless testing. */
  assetsUrl?: string;
}

type Size = 'orig' | 'large' | 'medium' | 'mobile';

interface Pick {
  id: string;
  name: string;
  description: string;
  author: string;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  /** Which of the conventional mp4 sizes exist for this item. */
  sizes: readonly Size[];
  category: Category;
}

const ALL: readonly Size[] = ['orig', 'large', 'medium', 'mobile'];

/** Footage that works as a wallpaper with the sound off. Order is the order shown. */
export const NASA_PICKS: readonly Pick[] = [
  { id: 'GSFC_20170211_SDO_m12500_Year7', name: 'SDO: Year 7', description: 'A year of the Sun in extreme ultraviolet, from the Solar Dynamics Observatory.', author: 'NASA Goddard / SDO', width: 3840, height: 2160, durationMs: 201_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'GSFC_20160426_SDO_m12224_SolarFlare_4K', name: 'Solar Flare in 4K', description: 'The April 17 solar flare, as the Solar Dynamics Observatory saw it.', author: 'NASA Goddard / SDO', width: 3840, height: 2160, durationMs: 79_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_ 2021_210422-4KMP4', name: 'Earth Views from the Station', description: 'Nearly an hour of Earth passing below the International Space Station, in 4K.', author: 'NASA Johnson', width: 3840, height: 2160, durationMs: 3_154_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'GSFC_20160601_Mercury_m12268_Transit_4K', name: 'Mercury Transit in 4K', description: 'Mercury crossing the face of the Sun, May 2016.', author: 'NASA Goddard / SDO', width: 3840, height: 2160, durationMs: 84_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'JPL-20220906-Perseverance_Explores_Jezero_Crater_Delta_UHD', name: 'Jezero Crater Delta', description: 'Across the river delta Perseverance explores on Mars.', author: 'NASA JPL', width: 3840, height: 2160, durationMs: 200_000, fps: 60, sizes: ALL, category: 'Cosmos' },
  { id: 'GSFC_20150211_SDO_m11762_5Years', name: 'Five Years of the Sun', description: 'Five years of the Sun compressed into a few minutes.', author: 'NASA Goddard / SDO', width: 1920, height: 1080, durationMs: 175_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'GSFC_20150420_Orbit_m11858_2014', name: 'Earth from Orbit', description: 'A year of Earth seen by NASA satellites: clouds, storms, ice and light.', author: 'NASA Goddard', width: 1920, height: 1080, durationMs: 190_000, fps: 30, sizes: ['large', 'medium', 'mobile'], category: 'Cosmos' },
  { id: 'GSFC_20170412_Lights_m12573_EarthAtNight', name: 'Earth at Night', description: 'The lights of human activity across the night side of the planet.', author: 'NASA Goddard', width: 1920, height: 1080, durationMs: 83_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'GSFC_20180313_Jupiter_m12878_GreatRedSpot', name: 'Jupiter’s Great Red Spot', description: 'The storm that has raged on Jupiter for centuries.', author: 'NASA Goddard', width: 1920, height: 1080, durationMs: 126_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'FD 17 hi res', name: 'Earth in Sight', description: 'Earth from Orion on Artemis I, flight day 17.', author: 'NASA Johnson', width: 1920, height: 1080, durationMs: 71_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover', name: 'Moon Flyover', description: 'Low over the Lee-Lincoln scarp at the Apollo 17 landing site.', author: 'NASA Goddard', width: 1920, height: 1080, durationMs: 30_000, fps: 30, sizes: ALL, category: 'Cosmos' },
  { id: 'ART-DL-1_2022_325_1209_SHARED_art001m1013251209', name: 'Earthset', description: 'Earth sinking behind the Moon as Orion prepares its outbound flyby.', author: 'NASA Johnson', width: 1280, height: 720, durationMs: 1_008_000, fps: 60, sizes: ALL, category: 'Cosmos' },
  { id: 'ART-CMA1_2022_325_1250_SHARED_art001m1203251250', name: 'Earthrise', description: 'Earth rising over the Moon after Orion’s powered flyby.', author: 'NASA Johnson', width: 1280, height: 1024, durationMs: 457_000, fps: 30, sizes: ['orig', 'medium', 'mobile'], category: 'Cosmos' },
  { id: 'GSFC_20140421_EarthOrbit_m11525', name: 'Earth from Orbit 2013', description: 'Another year of the planet from NASA’s Earth-observing satellites.', author: 'NASA Goddard', width: 1280, height: 720, durationMs: 228_000, fps: 30, sizes: ['medium', 'mobile'], category: 'Cosmos' },
];

/** NASA publishes the original's dimensions only; the smaller encodes say 0 (unknown). */
function fileFor(size: Size, folder: string, file: string, p: Pick): MediaFile {
  const orig = size === 'orig';
  return { url: `${folder}/${file}~${size}.mp4`, width: orig ? p.width : 0, height: orig ? p.height : 0, type: 'video/mp4' };
}

const ORDER: readonly Size[] = ['mobile', 'medium', 'large', 'orig'];

export function fromPick(p: Pick, assets = 'https://images-assets.nasa.gov'): Wallpaper {
  const folder = `${assets}/video/${encodeURIComponent(p.id)}`;
  const file = encodeURIComponent(p.id);
  return {
    id: `nasa:${p.id}`,
    name: p.name,
    category: p.category,
    publisher: 'NASA',
    initials: initialsOf('NASA'),
    description: p.description,
    hues: [250, 290, 220],
    res: resolutionLabel(p.width, p.height),
    resFull: `${p.width} × ${p.height}`,
    vertical: p.height > p.width,
    fps: p.fps,
    loop: loopLabel(p.durationMs),
    sizeMb: null,
    tier: 'free',
    media: {
      kind: 'video',
      poster: `${folder}/${file}~large.jpg`,
      thumbnail: `${folder}/${file}~medium.jpg`,
      preview: `${folder}/${file}~preview.mp4`,
      files: ORDER.filter((s) => p.sizes.includes(s)).map((s) => fileFor(s, folder, file, p)),
      durationMs: p.durationMs,
    },
    credit: {
      provider: 'NASA',
      providerUrl: 'https://images.nasa.gov/',
      author: p.author,
      authorUrl: null,
      sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(p.id)}`,
      license: 'Public domain (NASA media guidelines)',
    },
  };
}

export function nasaProvider(config: NasaConfig, ctx: ProviderContext): WallpaperProvider {
  const assets = (config.assetsUrl ?? 'https://images-assets.nasa.gov').replace(/\/+$/, '');
  const all = () => NASA_PICKS.map((p) => fromPick(p, assets));

  function slice(items: Wallpaper[], page: number, size: number): FeedPage {
    return { items: items.slice(page * size, (page + 1) * size), next: (page + 1) * size < items.length ? page + 1 : null };
  }

  return {
    name: 'nasa',
    label: 'NASA',
    homepage: 'https://images.nasa.gov/',
    async page(feed: Feed, page: number, size: number): Promise<FeedPage> {
      switch (feed.kind) {
        case 'featured':
          return slice(all().filter((w) => w.res === '4K'), page, size);
        case 'trending':
          return slice(all(), page, size);
        case 'category':
          return slice(all().filter((w) => w.category === feed.category), page, size);
        case 'search': {
          const q = feed.query.trim().toLowerCase();
          if (!q) return { items: [], next: null };
          const words = ['nasa', 'space', 'cosmos', 'sun', 'earth', 'mars', 'moon', 'jupiter', 'mercury', 'solar', 'planet'];
          return slice(all().filter((w) => `${w.name} ${w.description} ${w.publisher}`.toLowerCase().includes(q) || (words.includes(q) && w.category === 'Cosmos')), page, size);
        }
      }
    },
    async get(id: string): Promise<Wallpaper | null> {
      const p = NASA_PICKS.find((x) => x.id === id);
      if (!p) return null;
      const w = fromPick(p, assets);
      // The manifest is the authority on which files exist; the table is the fallback.
      try {
        const res = await ctx.fetch(`${assets}/video/${encodeURIComponent(id)}/collection.json`);
        if (res.ok) {
          const urls = ((await res.json()) as unknown[]).filter((u): u is string => typeof u === 'string');
          const present = new Set(urls.map((u) => u.match(/~(orig|large|medium|mobile)\.mp4$/)?.[1]).filter(Boolean));
          const files = w.media!.files.filter((f) => present.has(f.url.match(/~(orig|large|medium|mobile)\.mp4$/)![1]));
          if (files.length) w.media = { ...w.media!, files };
        }
      } catch {
        // Offline: the table's list.
      }
      return w;
    },
  };
}
