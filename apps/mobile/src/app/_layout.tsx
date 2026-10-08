import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { color } from '@drift/tokens';
import { Toast } from '../components/Toast';
import { refreshPlan, restoreSession } from '../lib/account';
import { listenForPurchases } from '../lib/purchases';
import { checkFollowedCreators, wallpaperFromResponse } from '../lib/notifications';
import { getState, loadPersisted, useApp } from '../lib/store';

void SplashScreen.preventAutoHideAsync();

// Show Drift's notifications even while Drift is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

function openFromNotification(response: Notifications.NotificationResponse | null) {
  const id = wallpaperFromResponse(response);
  if (id === null) return;
  // Handled: the next launch should not reopen it.
  Notifications.clearLastNotificationResponse();
  router.push(`/wallpaper/${id}`);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const ready = useApp((s) => s.ready);

  useEffect(() => {
    // The session reads the library to sync it, so it waits for the saved one to load.
    void loadPersisted().then(restoreSession);
    void listenForPurchases();
  }, []);

  // Back in the foreground is when the plan most likely changed (bought on another device, or a
  // renewal) and when other devices' edits are worth pulling in. Refreshing also syncs for Pro.
  useEffect(() => {
    let last = 0;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || getState().account.status !== 'signedIn' || Date.now() - last < 30_000) return;
      last = Date.now();
      void refreshPlan();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded && ready) void SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);

  // Settings are loaded once `ready`; check now and whenever Drift comes back to the front.
  useEffect(() => {
    if (!ready) return;
    void checkFollowedCreators();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void checkFollowedCreators());
    return () => sub.remove();
  }, [ready]);

  // Wait for the navigator before following a tapped notification.
  useEffect(() => {
    if (!fontsLoaded || !ready) return;
    openFromNotification(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => sub.remove();
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {/* The design hides the status bar on Home so the wallpaper runs edge to edge. */}
        <StatusBar style="light" hidden />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="wallpaper/[id]" options={{ animation: 'fade' }} />
          <Stack.Screen name="account" />
          <Stack.Screen name="about" />
          <Stack.Screen name="upgrade" options={{ presentation: 'modal' }} />
          <Stack.Screen name="live-photo" options={{ presentation: 'modal' }} />
          <Stack.Screen name="shortcut-setup" options={{ presentation: 'modal' }} />
        </Stack>
        <Toast />
      </View>
    </SafeAreaProvider>
  );
}
