// How the placeholder art moves, shared by the in-app `Art` and the native wallpapers so the phone
// wallpaper drifts exactly like its preview.

/** How much larger than the frame the art is drawn, as in the design's background-size. */
export const OVERSCAN_X = 2.2;
export const OVERSCAN_Y = 1.6;
/** One sweep across the art; it then sweeps back, eased in and out. */
export const DRIFT_MS = 14000;
