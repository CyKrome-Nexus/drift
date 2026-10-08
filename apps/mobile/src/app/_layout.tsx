import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { color } from '@drift/tokens';
import { Toast } from '../components/Toast';
import { restoreSession } from '../lib/account';
import { loadPersisted, useApp } from '../lib/store';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const ready = useApp((s) => s.ready);

  useEffect(() => {
    void loadPersisted();
    void restoreSession();
  }, []);

  useEffect(() => {
    if (fontsLoaded && ready) void SplashScreen.hideAsync();
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
        </Stack>
        <Toast />
      </View>
    </SafeAreaProvider>
  );
}
