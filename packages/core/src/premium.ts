// Drift Pro.
//
// Every Pro-only behaviour is named here and nowhere else, so "what does Pro get you" has one
// answer — the upgrade sheet, the lock badges and the gates all read this table.

export type Plan = 'free' | 'pro';

export type ProFeature =
  | 'proWallpapers'
  | 'unlimitedFrameRate'
  | 'multiDisplay'
  | 'unlimitedLists'
  | 'sync'
  | 'offline';

export const PRO_FEATURES: ReadonlyArray<{ id: ProFeature; title: string; detail: string; soon?: true }> = [
  { id: 'proWallpapers', title: 'Pro wallpapers', detail: 'Apply and download the 5K masters.' },
  { id: 'unlimitedFrameRate', title: 'Unlimited frame rate', detail: 'Play loops at your display’s full refresh rate.' },
  { id: 'multiDisplay', title: 'Span & per-display', detail: 'Stretch one loop across screens, or give each its own.' },
  { id: 'unlimitedLists', title: 'Unlimited lists', detail: 'Free accounts keep one list.' },
  { id: 'sync', title: 'Sync everywhere', detail: 'Favourites, lists and followed creators follow your CyKrome Account to every device.' },
  { id: 'offline', title: 'Offline library', detail: 'Your library and Pro keep working with no connection, until your plan’s renewal date.' },
];

/** How many lists a free account may keep. */
export const FREE_LIST_LIMIT = 1;

export function hasFeature(plan: Plan, _feature: ProFeature): boolean {
  // Today every feature is all-or-nothing on Pro. Kept per-feature so a future tier, a trial,
  // or a feature graduating to free changes this function and nothing else.
  return plan === 'pro';
}

export function canApply(plan: Plan, tier: 'free' | 'pro'): boolean {
  return tier === 'free' || hasFeature(plan, 'proWallpapers');
}

export function canCreateList(plan: Plan, existingLists: number): boolean {
  return existingLists < FREE_LIST_LIMIT || hasFeature(plan, 'unlimitedLists');
}

/** Settings options that are Pro-only, keyed by setting then option. */
export const PRO_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  fps: ['Unlimited', '120'],
  monitors: ['Span', 'Per display'],
};

export function isProOption(setting: string, option: string): boolean {
  return PRO_OPTIONS[setting]?.includes(option) ?? false;
}
