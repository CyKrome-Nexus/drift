// Stand-ins for the native modules the app's logic touches. Tests inspect them via `./fakes`.
import { beforeEach, vi } from 'vitest';
import { native } from './fakes';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { native } = await import('./fakes');
  return {
    default: {
      getItem: async (k: string) => native.storage.get(k) ?? null,
      setItem: async (k: string, v: string) => void native.storage.set(k, v),
    },
  };
});

vi.mock('expo-secure-store', async () => {
  const { native } = await import('./fakes');
  return {
    getItemAsync: async (k: string) => native.secure.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void native.secure.set(k, v),
    deleteItemAsync: async (k: string) => void native.secure.delete(k),
  };
});

vi.mock('expo-router', async () => {
  const { native } = await import('./fakes');
  return { router: { push: (route: string) => native.routes.push(route) } };
});

vi.mock('react-native', async () => {
  const { native } = await import('./fakes');
  return { Platform: { get OS() { return native.os; } } };
});

beforeEach(() => {
  native.storage.clear();
  native.secure.clear();
  native.routes.length = 0;
  native.os = 'ios';
});
