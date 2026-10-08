// The phone's native wallpaper code (see android/ and ios/). Absent in Expo Go, which only
// carries Expo's own modules: callers treat `null` as "needs the Drift development build".
import { requireOptionalNativeModule } from 'expo';

export interface DriftWallpaperModule {
  /** Whether Drift is the current wallpaper. Always false on iOS, which does not say. */
  isActive(): boolean;
  /** Android: store the spec and switch the running wallpaper, or open the system preview. */
  setLiveWallpaper?(spec: string): Promise<'applied' | 'picker'>;
  /** iOS: render the spec as a Live Photo and add it to Photos. */
  saveLivePhoto?(spec: string): Promise<'saved'>;
}

export default requireOptionalNativeModule<DriftWallpaperModule>('DriftWallpaper');
