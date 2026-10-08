// Stand-ins for the native modules the app's logic touches. Tests inspect them via `./fakes`.
import { beforeEach, vi } from 'vitest';
import { native, type NativeFakes } from './fakes';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { native } = await import('./fakes');
  return {
    default: {
      getItem: async (k: string) => native.storage.get(k) ?? null,
      setItem: async (k: string, v: string) => void native.storage.set(k, v),
      removeItem: async (k: string) => void native.storage.delete(k),
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

vi.mock('expo-crypto', async () => {
  const { webcrypto } = await import('node:crypto');
  return { getRandomValues: <T extends Uint8Array>(a: T) => webcrypto.getRandomValues(a) };
});

vi.mock('expo-application', () => ({ applicationId: 'com.cykrome.drift' }));

vi.mock('expo-router', async () => {
  const { native } = await import('./fakes');
  return { router: { push: (route: string) => native.routes.push(route) } };
});

vi.mock('react-native', async () => {
  const { native } = await import('./fakes');
  return {
    Platform: { get OS() { return native.os; } },
    Linking: {
      openURL: async (url: string) => {
        if (native.openUrlFails) throw new Error(`Unable to open URL: ${url}`);
        native.openedUrls.push(url);
      },
    },
  };
});

vi.mock('../../modules/drift-wallpaper', async () => {
  const { native } = await import('./fakes');
  const call = async <T>(spec: string, result: T): Promise<T> => {
    native.wallpaper.specs.push(spec);
    if (native.wallpaper.error) throw native.wallpaper.error;
    return result;
  };
  return {
    get default() {
      if (!native.wallpaper.available) return null;
      return {
        isActive: () => false,
        setLiveWallpaper: (spec: string) => call(spec, native.wallpaper.androidResult),
        saveLivePhoto: (spec: string) => call(spec, 'saved' as const),
      };
    },
  };
});

vi.mock('expo-notifications', async () => {
  const { native } = await import('./fakes');
  const n = () => native.notifications;
  return {
    AndroidImportance: { DEFAULT: 3 },
    setNotificationChannelAsync: async () => null,
    getPermissionsAsync: async () => ({ granted: n().granted, canAskAgain: n().canAskAgain }),
    requestPermissionsAsync: async () => {
      n().asked++;
      return { granted: n().granted, canAskAgain: n().canAskAgain };
    },
    scheduleNotificationAsync: async ({ content }: { content: NativeFakes['notifications']['scheduled'][number] }) => {
      n().scheduled.push(content);
      return `n${n().scheduled.length}`;
    },
  };
});

beforeEach(() => {
  native.storage.clear();
  native.secure.clear();
  native.routes.length = 0;
  native.os = 'ios';
  native.openedUrls = [];
  native.openUrlFails = false;
  native.wallpaper = { available: true, specs: [], androidResult: 'picker', error: null };
  native.notifications = { granted: false, canAskAgain: true, asked: 0, scheduled: [] };
});
