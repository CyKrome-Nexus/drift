// State behind the native stand-ins in setup.ts. Kept on globalThis so it is the same object
// after `vi.resetModules()`, which tests use to start each store fresh.

export interface NativeFakes {
  storage: Map<string, string>;
  secure: Map<string, string>;
  routes: string[];
  os: 'ios' | 'android';
  /** URLs passed to `Linking.openURL`; `openUrlFails` makes it reject. */
  openedUrls: string[];
  openUrlFails: boolean;
  /** The Drift wallpaper module. `available: false` is Expo Go. */
  wallpaper: { available: boolean; specs: string[]; androidResult: 'applied' | 'picker'; error: Error | null };
  notifications: { granted: boolean; canAskAgain: boolean; asked: number; scheduled: Array<{ title: string; body: string; data: Record<string, unknown> }> };
}

const g = globalThis as { __driftNative?: NativeFakes };

export const native: NativeFakes = (g.__driftNative ??= {
  storage: new Map(),
  secure: new Map(),
  routes: [],
  os: 'ios',
  openedUrls: [],
  openUrlFails: false,
  wallpaper: { available: true, specs: [], androidResult: 'picker', error: null },
  notifications: { granted: false, canAskAgain: true, asked: 0, scheduled: [] },
});
