// Settings models and defaults. Desktop and phone have different knobs, so they are separate
// shapes; both are plain JSON so either platform can persist them however it likes.

import { isProOption, type Plan } from './premium';

export interface DesktopSettings {
  launchAtLogin: boolean;
  showInTray: boolean;
  resumeOnStartup: boolean;
  pauseFullscreen: boolean;
  pauseOnBattery: boolean;
  muteAudio: boolean;
  hardwareAcceleration: boolean;
  pauseHighCpu: boolean;
  fps: '30' | '60' | 'Unlimited';
  quality: 'Low' | 'Balanced' | 'High';
  monitors: 'Same' | 'Span' | 'Per display';
  scale: 'Fill' | 'Fit' | 'Stretch';
  downloadDir: string;
  applyTarget: 'Desktop' | 'Lock screen' | 'Both';
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  // Off until the user asks: adding a login item uninvited is not ours to decide.
  launchAtLogin: false,
  showInTray: true,
  resumeOnStartup: true,
  pauseFullscreen: true,
  pauseOnBattery: true,
  muteAudio: true,
  hardwareAcceleration: true,
  pauseHighCpu: false,
  fps: '60',
  quality: 'High',
  monitors: 'Same',
  scale: 'Fill',
  downloadDir: '~/Pictures/Drift',
  applyTarget: 'Both',
};

export interface MobileSettings {
  pauseLowPower: boolean;
  pauseGaming: boolean;
  muteAudio: boolean;
  wifiOnly: boolean;
  notifyFollowed: boolean;
  fps: '30' | '60' | '120';
  quality: 'Standard' | 'High';
  applyTarget: 'Home' | 'Lock' | 'Both';
}

export const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  pauseLowPower: true,
  pauseGaming: true,
  muteAudio: true,
  wifiOnly: true,
  notifyFollowed: false,
  fps: '60',
  quality: 'High',
  applyTarget: 'Both',
};

/**
 * Pull any Pro-only choice back to its free default.
 *
 * Run on load and whenever the plan changes, so a lapsed subscription does not leave the
 * engine running at a setting the account no longer covers.
 */
export function clampToPlan<T extends object>(settings: T, defaults: T, plan: Plan): T {
  if (plan === 'pro') return settings;
  const out = { ...settings };
  for (const key of Object.keys(out) as Array<keyof T & string>) {
    const value = out[key];
    if (typeof value === 'string' && isProOption(key, value)) out[key] = defaults[key];
  }
  return out;
}

/** Merge persisted JSON over defaults, dropping keys the current version no longer knows. */
export function hydrate<T extends object>(stored: unknown, defaults: T): T {
  if (!stored || typeof stored !== 'object') return { ...defaults };
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const v = (stored as Record<string, unknown>)[key as string];
    if (v !== undefined && typeof v === typeof defaults[key]) out[key] = v as T[keyof T];
  }
  return out;
}
