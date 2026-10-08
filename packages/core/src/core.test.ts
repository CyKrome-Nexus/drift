import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_SETTINGS,
  FEATURED,
  TRENDING,
  art,
  artCss,
  canApply,
  canCreateList,
  catalog,
  clampToPlan,
  hydrate,
  moreLike,
  driftAt,
  easeInOut,
  loopPositionMs,
  oklchToHex,
  search,
} from './index';

describe('oklchToHex', () => {
  it('maps the OKLCH extremes to black and white', () => {
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
  });

  it('matches the CSS Color 4 reference conversion', () => {
    // oklch(0.628 0.2577 29.23) is the sRGB red primary.
    expect(oklchToHex(0.62796, 0.25768, 29.234)).toBe('#ff0000');
    // The design's accent, #9184d9, sits at roughly oklch(0.66 0.125 289).
    const [r, g, b] = oklchToHex(0.66, 0.125, 289.2).slice(1).match(/../g)!.map((h) => parseInt(h, 16));
    expect(Math.abs(r - 0x91)).toBeLessThan(4);
    expect(Math.abs(g - 0x84)).toBeLessThan(4);
    expect(Math.abs(b - 0xd9)).toBeLessThan(4);
  });

  it('clips out-of-gamut colours instead of producing invalid hex', () => {
    expect(oklchToHex(0.7, 0.4, 150)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('catalog', () => {
  const all = catalog();

  it('has the 24 wallpapers from the design, with stable ids', () => {
    expect(all).toHaveLength(24);
    all.forEach((w, i) => expect(w.id).toBe(i));
    expect(all[6].name).toBe('Event Horizon');
  });

  it('ranks exactly the trending ten as 1–10', () => {
    TRENDING.forEach((id, i) => expect(all[id].rank).toBe(i + 1));
    expect(all.filter((w) => w.rank <= 10)).toHaveLength(10);
  });

  it('keeps every featured wallpaper free, so the hero is always applicable', () => {
    FEATURED.forEach((id) => expect(all[id].tier).toBe('free'));
  });

  it('makes the 5K masters the Pro tier', () => {
    for (const w of all) expect(w.tier === 'pro').toBe(w.res === '5K');
    expect(all.some((w) => w.tier === 'pro')).toBe(true);
  });

  it('finds more from the same publisher before the same category, never the wallpaper itself', () => {
    const w = all[6];
    const more = moreLike(w);
    expect(more).toHaveLength(3);
    expect(more.map((x) => x.id)).not.toContain(w.id);
    expect(new Set(more.map((x) => x.id)).size).toBe(3);
  });

  it('searches names, publishers and categories case-insensitively', () => {
    expect(search('horizon').map((w) => w.id)).toEqual([6]);
    expect(search('COSMOS')).toHaveLength(6);
    expect(search('   ')).toEqual([]);
  });
});

describe('art', () => {
  it('produces three fields over a base, in hex', () => {
    const a = art(catalog()[0], 'portrait');
    expect(a.layers).toHaveLength(3);
    for (const l of a.layers) expect(l.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('renders as a four-layer CSS background', () => {
    const css = artCss(catalog()[3]);
    expect(css.match(/radial-gradient/g)).toHaveLength(3);
    expect(css).toContain('linear-gradient(160deg');
  });
});

describe('Pro gating', () => {
  it('lets anyone apply free wallpapers and only Pro apply Pro ones', () => {
    expect(canApply('free', 'free')).toBe(true);
    expect(canApply('free', 'pro')).toBe(false);
    expect(canApply('pro', 'pro')).toBe(true);
  });

  it('allows one list on free and any number on Pro', () => {
    expect(canCreateList('free', 0)).toBe(true);
    expect(canCreateList('free', 1)).toBe(false);
    expect(canCreateList('pro', 40)).toBe(true);
  });

  it('pulls Pro-only settings back to defaults when the plan is free', () => {
    const s = { ...DEFAULT_DESKTOP_SETTINGS, fps: 'Unlimited' as const, monitors: 'Span' as const, quality: 'Low' as const };
    const clamped = clampToPlan(s, DEFAULT_DESKTOP_SETTINGS, 'free');
    expect(clamped.fps).toBe(DEFAULT_DESKTOP_SETTINGS.fps);
    expect(clamped.monitors).toBe(DEFAULT_DESKTOP_SETTINGS.monitors);
    expect(clamped.quality).toBe('Low');
    expect(clampToPlan(s, DEFAULT_DESKTOP_SETTINGS, 'pro')).toBe(s);
  });
});

describe('loopPositionMs', () => {
  it('is the time since start, wrapped to the loop', () => {
    expect(loopPositionMs(1_000, 1_000, 32_000)).toBe(0);
    expect(loopPositionMs(1_000, 6_000, 32_000)).toBe(5_000);
    expect(loopPositionMs(0, 70_000, 32_000)).toBe(6_000);
  });

  it('gives two viewers that read the same start the same position', () => {
    const start = 1_700_000_000_000;
    const now = start + 123_456;
    expect(loopPositionMs(start, now)).toBe(loopPositionMs(start, now));
  });

  it('never goes negative when the clock is behind the start', () => {
    expect(loopPositionMs(10_000, 9_000, 32_000)).toBe(31_000);
  });
});

describe('driftAt', () => {
  it('runs forward over the first half of the loop and back over the second', () => {
    expect(driftAt(0, 32_000)).toBe(0);
    expect(driftAt(16_000, 32_000)).toBe(1);
    expect(driftAt(8_000, 32_000)).toBeCloseTo(0.5, 6);
    expect(driftAt(4_000, 32_000)).toBeCloseTo(driftAt(28_000, 32_000), 9);
    expect(driftAt(32_000, 32_000)).toBe(0);
  });

  it('eases like CSS ease-in-out: slow at the ends, symmetric about the middle', () => {
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
    expect(easeInOut(0.3) + easeInOut(0.7)).toBeCloseTo(1, 6);
    // Reference value for cubic-bezier(0.42, 0, 0.58, 1) at x = 0.25.
    expect(easeInOut(0.25)).toBeCloseTo(0.1291, 3);
  });
});

describe('hydrate', () => {
  it('keeps known keys of the right type and drops the rest', () => {
    const out = hydrate({ fps: '30', muteAudio: 'yes', stale: 1 }, DEFAULT_DESKTOP_SETTINGS);
    expect(out.fps).toBe('30');
    expect(out.muteAudio).toBe(DEFAULT_DESKTOP_SETTINGS.muteAudio);
    expect('stale' in out).toBe(false);
  });

  it('survives garbage', () => {
    expect(hydrate(null, DEFAULT_DESKTOP_SETTINGS)).toEqual(DEFAULT_DESKTOP_SETTINGS);
    expect(hydrate('nope', DEFAULT_DESKTOP_SETTINGS)).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });
});
