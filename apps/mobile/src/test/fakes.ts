// State behind the native stand-ins in setup.ts. Kept on globalThis so it is the same object
// after `vi.resetModules()`, which tests use to start each store fresh.

export interface NativeFakes {
  storage: Map<string, string>;
  secure: Map<string, string>;
  routes: string[];
  os: 'ios' | 'android';
}

const g = globalThis as { __driftNative?: NativeFakes };

export const native: NativeFakes = (g.__driftNative ??= {
  storage: new Map(),
  secure: new Map(),
  routes: [],
  os: 'ios',
});
