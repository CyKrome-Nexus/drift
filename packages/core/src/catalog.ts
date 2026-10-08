// The wallpaper catalog.
//
// This is the placeholder catalog from the design handoff: 24 wallpapers whose "art" is
// generated gradient motion until real loops are dropped in. When the catalog moves to CDS,
// replace `catalog()` with a fetch that returns the same `Wallpaper` shape — every screen reads
// only that shape.

export type Category = 'Ambient' | 'Cosmos' | 'Abstract' | 'Nature';
export type Tier = 'free' | 'pro';

export interface Wallpaper {
  id: number;
  name: string;
  category: Category;
  publisher: string;
  initials: string;
  description: string;
  /** The three OKLCH hues the art is generated from. */
  hues: [number, number, number];
  /** Desktop resolution label and pixels, e.g. "4K" / "3840 × 2160". */
  res: string;
  resFull: string;
  /** Phone-native frame, e.g. "1290 × 2796". */
  phoneRes: string;
  fps: number;
  loop: string;
  sizeMb: number;
  phoneSizeMb: number;
  /** 1–10 for the weekly top ten; 11+ otherwise. */
  rank: number;
  rating: string;
  ratings: string;
  applies: string;
  followers: string;
  /** Pro wallpapers need Drift Pro to apply or download. Anyone can browse and preview them. */
  tier: Tier;
}

export const CATEGORIES: ReadonlyArray<{ title: string; category: Category }> = [
  { title: 'Ambient & calm', category: 'Ambient' },
  { title: 'Cosmos', category: 'Cosmos' },
  { title: 'Abstract motion', category: 'Abstract' },
  { title: 'Nature loops', category: 'Nature' },
];

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

/** Weekly top ten, by wallpaper id. */
export const TRENDING: readonly number[] = [12, 6, 2, 18, 13, 7, 20, 0, 15, 9];
/** The four wallpapers the home hero cycles through. */
export const FEATURED: readonly number[] = [6, 12, 2, 18];

const DESKTOP_RES: ReadonlyArray<[string, string]> = [['4K', '3840 × 2160'], ['5K', '5120 × 2880'], ['4K', '3840 × 2160'], ['1440p', '2560 × 1440']];
const PHONE_RES = ['1290 × 2796', '1440 × 3200', '1290 × 2796', '1080 × 2400'];

let cached: Wallpaper[] | null = null;

export function catalog(): Wallpaper[] {
  if (cached) return cached;
  cached = RAW.map(([name, category, a, b, c], i) => {
    const publisher = PUBLISHERS[(i * 3) % PUBLISHERS.length];
    const r = TRENDING.indexOf(i);
    const [res, resFull] = DESKTOP_RES[i % 4];
    return {
      id: i,
      name,
      category,
      publisher,
      initials: publisher.split(' ').map((s) => s[0]).join('').slice(0, 2),
      description: DESCRIPTIONS[category],
      hues: [a, b, c],
      res,
      resFull,
      phoneRes: PHONE_RES[i % 4],
      fps: [60, 30, 60, 120][i % 4],
      loop: `0:${String(12 + ((i * 7) % 40)).padStart(2, '0')}`,
      sizeMb: 80 + ((i * 37) % 160),
      phoneSizeMb: 30 + ((i * 17) % 70),
      rank: r >= 0 ? r + 1 : 11 + i,
      rating: (4.9 - (i % 5) * 0.1).toFixed(1),
      ratings: `${(1.2 + ((i * 0.37) % 3)).toFixed(1)}k`,
      applies: `${12 + ((i * 13) % 60)}.${i % 9}k`,
      followers: `${18 + ((i * 11) % 80)}.${i % 7}k`,
      // The 5K masters are the Pro tier.
      tier: res === '5K' ? 'pro' : 'free',
    } satisfies Wallpaper;
  });
  return cached;
}

export function wallpaper(id: number): Wallpaper {
  const w = catalog()[id];
  if (!w) throw new Error(`No wallpaper with id ${id}`);
  return w;
}

export function byCategory(category: Category): Wallpaper[] {
  return catalog().filter((w) => w.category === category);
}

/** Same publisher first, then same category — what the detail view shows under "More from". */
export function moreLike(w: Wallpaper, count = 3): Wallpaper[] {
  const all = catalog();
  const seen = new Set<number>([w.id]);
  const out: Wallpaper[] = [];
  for (const x of [...all.filter((x) => x.publisher === w.publisher), ...all.filter((x) => x.category === w.category)]) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
    if (out.length === count) break;
  }
  return out;
}

export function search(query: string): Wallpaper[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return catalog().filter((w) => [w.name, w.publisher, w.category].some((s) => s.toLowerCase().includes(q)));
}
