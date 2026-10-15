// The wallpaper shape every screen reads, and Drift's own generated wallpapers.
//
// Wallpapers come from providers (@drift/wallpapers): stock-video APIs such as Coverr and NASA,
// and the 24 generated gradient loops below, which need no network. Each provider maps its
// API onto this one shape, so no screen knows where a wallpaper came from.
//
// Ids are `<provider>:<provider's own id>` (`coverr:S1YbPl1NfI`, `nasa:PIA12345`, `drift:6`).

export type Category = 'Ambient' | 'Cosmos' | 'Abstract' | 'Nature';
export type Tier = 'free' | 'pro';
export type WallpaperId = string;

export interface MediaFile {
  url: string;
  /** Pixels; 0 when the provider does not say. */
  width: number;
  height: number;
  /** MIME type, e.g. `video/mp4`. */
  type: string;
}

/** A real wallpaper's files. Generated wallpapers have none (`media: null`). */
export interface WallpaperMedia {
  kind: 'video' | 'image';
  /** A full-size still: lock screens, and the frame shown before the video starts. */
  poster: string;
  /** A small still for cards. */
  thumbnail: string;
  /** A small, short video for cards and previews. */
  preview: string | null;
  /** Full-quality files, smallest first. Some providers only list these when asked (`get`). */
  files: MediaFile[];
  /** Length of one loop; null until known. */
  durationMs: number | null;
}

/** Who to credit, as the provider's terms require. Shown wherever the wallpaper is. */
export interface Credit {
  /** Provider display name, e.g. "Coverr". */
  provider: string;
  providerUrl: string;
  author: string | null;
  authorUrl: string | null;
  /** The wallpaper's own page at the provider. */
  sourceUrl: string | null;
  license: string;
}

export interface Wallpaper {
  id: WallpaperId;
  name: string;
  category: Category;
  publisher: string;
  initials: string;
  description: string;
  /** Three OKLCH hues: the generated art, or a tint shown while a real wallpaper loads. */
  hues: [number, number, number];
  /** Resolution label and pixels, e.g. "4K" / "3840 × 2160". */
  res: string;
  resFull: string;
  /** Portrait (phone) footage. */
  vertical: boolean;
  /** Null where the provider does not say. */
  fps: number | null;
  /** Loop length as "m:ss"; null until known. */
  loop: string | null;
  sizeMb: number | null;
  /** Generated art only: the design's placeholder stats. */
  rank?: number;
  stats?: { rating: string; ratings: string; applies: string; followers: string; phoneRes: string; phoneSizeMb: number };
  /** Pro wallpapers need Drift Pro to apply or download. Anyone can browse and preview them. */
  tier: Tier;
  /** Null: generated art, painted from `hues` (see art.ts). */
  media: WallpaperMedia | null;
  credit: Credit;
}

export const CATEGORIES: ReadonlyArray<{ title: string; category: Category }> = [
  { title: 'Ambient & calm', category: 'Ambient' },
  { title: 'Cosmos', category: 'Cosmos' },
  { title: 'Abstract motion', category: 'Abstract' },
  { title: 'Nature loops', category: 'Nature' },
];

/** The provider prefix of an id: `coverr` for `coverr:S1YbPl1NfI`. */
export function providerOf(id: WallpaperId): string {
  const i = id.indexOf(':');
  return i > 0 ? id.slice(0, i) : '';
}

/**
 * Saved favourites, lists and history from before providers held numbers: the generated
 * wallpapers' indexes. Anything else that is not a provider id is dropped.
 */
export function migrateId(raw: unknown): WallpaperId | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < RAW.length) return `drift:${raw}`;
  if (typeof raw === 'string' && /^[a-z0-9]+:.+/.test(raw)) return raw;
  return null;
}

export function migrateIds(raw: unknown): WallpaperId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(migrateId).filter((id): id is WallpaperId => id !== null))];
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
}

/** "4K" for 2160 lines, and so on. */
export function resolutionLabel(width: number, height: number): string {
  const lines = Math.min(width, height) || height;
  if (lines >= 2880) return '5K';
  if (lines >= 2160) return '4K';
  if (lines >= 1440) return '1440p';
  if (lines >= 1080) return '1080p';
  if (lines >= 720) return '720p';
  return lines > 0 ? `${lines}p` : 'HD';
}

/** "0:12" for 12.4s. */
export function loopLabel(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Three hues from any string, for the tint behind a wallpaper that is still loading. */
export function huesOf(seed: string): [number, number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const a = (h >>> 0) % 360;
  return [a, (a + 40) % 360, (a + 300) % 360];
}

// ---- Drift's generated wallpapers ---------------------------------------------------------

export const DRIFT_CREDIT: Credit = {
  provider: 'Drift',
  providerUrl: 'https://nexus.cykrome.com/drift/',
  author: null,
  authorUrl: null,
  sourceUrl: null,
  license: 'Generated by Drift',
};

const PUBLISHERS = ['Halcyon Studio', 'Mira Okafor', 'Parallax Lab', 'Kenji Arai', 'Northbound', 'Loopcraft', 'Sora Visuals', 'Ines Duarte'];

const DESCRIPTIONS: Record<Category, string> = {
  Ambient: 'A slow, breathing loop tuned for long focus sessions — barely-there motion that never pulls your eye.',
  Cosmos: 'Deep-field drift rendered in real time. Dust lanes rotate over minutes, not seconds.',
  Abstract: 'Liquid colour fields folding into each other on a seamless loop, reactive to your cursor.',
  Nature: 'Captured at dawn and looped by hand, with a soft parallax that follows the time of day.',
};

const RAW: ReadonlyArray<[string, Category, number, number, number]> = [
  ['Tidal Hush', 'Ambient', 210, 240, 190], ['Fog Over Kelp', 'Ambient', 200, 170, 230], ['Slow Aurora', 'Ambient', 160, 250, 280],
  ['Glasshouse Rain', 'Ambient', 230, 200, 260], ['Blue Hour Pier', 'Ambient', 250, 220, 200], ['Drift Ice', 'Ambient', 195, 215, 240],
  ['Event Horizon', 'Cosmos', 290, 250, 320], ['Nebula Loom', 'Cosmos', 310, 270, 230], ['Orbital Dust', 'Cosmos', 270, 300, 40],
  ['Saturn Dusk', 'Cosmos', 40, 280, 250], ['Pulsar Garden', 'Cosmos', 320, 290, 200], ['Comet Wake', 'Cosmos', 260, 300, 180],
  ['Molten Silk', 'Abstract', 30, 350, 60], ['Chroma Fold', 'Abstract', 330, 280, 20], ['Ember Lattice', 'Abstract', 20, 50, 300],
  ['Liquid Brass', 'Abstract', 70, 40, 20], ['Signal Bloom', 'Abstract', 350, 300, 60], ['Copper Tide', 'Abstract', 45, 20, 190],
  ['Moss Canopy', 'Nature', 140, 170, 100], ['Fern Breathing', 'Nature', 120, 150, 90], ['Lagoon Light', 'Nature', 180, 160, 210],
  ['Pine Mist', 'Nature', 160, 130, 200], ['Firefly Field', 'Nature', 100, 140, 60], ['Monsoon Leaf', 'Nature', 150, 190, 120],
];

/** The generated set's weekly top ten, by index. */
export const GENERATED_TRENDING: readonly number[] = [12, 6, 2, 18, 13, 7, 20, 0, 15, 9];
/** The four generated wallpapers the home hero falls back to. */
export const GENERATED_FEATURED: readonly number[] = [6, 12, 2, 18];

const DESKTOP_RES: ReadonlyArray<[string, string]> = [['4K', '3840 × 2160'], ['5K', '5120 × 2880'], ['4K', '3840 × 2160'], ['1440p', '2560 × 1440']];
const PHONE_RES = ['1290 × 2796', '1440 × 3200', '1290 × 2796', '1080 × 2400'];

let generated: Wallpaper[] | null = null;

/** The 24 generated gradient loops, in a fixed order (`drift:0` … `drift:23`). */
export function generatedWallpapers(): Wallpaper[] {
  if (generated) return generated;
  generated = RAW.map(([name, category, a, b, c], i) => {
    const publisher = PUBLISHERS[(i * 3) % PUBLISHERS.length];
    const r = GENERATED_TRENDING.indexOf(i);
    const [res, resFull] = DESKTOP_RES[i % 4];
    return {
      id: `drift:${i}`,
      name,
      category,
      publisher,
      initials: initialsOf(publisher),
      description: DESCRIPTIONS[category],
      hues: [a, b, c],
      res,
      resFull,
      vertical: false,
      fps: [60, 30, 60, 120][i % 4],
      loop: `0:${String(12 + ((i * 7) % 40)).padStart(2, '0')}`,
      sizeMb: 80 + ((i * 37) % 160),
      rank: r >= 0 ? r + 1 : 11 + i,
      stats: {
        rating: (4.9 - (i % 5) * 0.1).toFixed(1),
        ratings: `${(1.2 + ((i * 0.37) % 3)).toFixed(1)}k`,
        applies: `${12 + ((i * 13) % 60)}.${i % 9}k`,
        followers: `${18 + ((i * 11) % 80)}.${i % 7}k`,
        phoneRes: PHONE_RES[i % 4],
        phoneSizeMb: 30 + ((i * 17) % 70),
      },
      // The 5K masters are the Pro tier.
      tier: res === '5K' ? 'pro' : 'free',
      media: null,
      credit: DRIFT_CREDIT,
    } satisfies Wallpaper;
  });
  return generated;
}

/** The index of a generated wallpaper, for anything that needs a stable small number. */
export function generatedIndex(w: Pick<Wallpaper, 'id'>): number {
  const n = Number(w.id.startsWith('drift:') ? w.id.slice(6) : NaN);
  return Number.isInteger(n) ? n : 0;
}
