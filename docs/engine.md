# Wallpaper engine (desktop)

The engine puts a loop behind the desktop icons. It lives in `apps/desktop/src-tauri/src/engine/`:

| File | What it does |
| --- | --- |
| `mod.rs` | State, applying and stopping, laying windows out per display, the monitor thread |
| `conditions.rs` | Turns battery, fullscreen and CPU readings into "pause or play" |
| `macos.rs`, `windows.rs`, `linux.rs` | Putting a window behind the icons, and the OS readings |

Each wallpaper is a borderless webview loading `wallpaper.html` (`src/wallpaper.tsx`). The page draws
its own frames on a canvas: the art is painted once into a box 170% of the screen, and each frame only
moves that box to where the shared loop clock (`startedAtMs`, `packages/core/src/playback.ts`) says.
That is the same position and easing as the app's CSS previews, so the two stay in step.

## Displays

Settings › Displays › Multiple displays:

- **Same**: one window per display, all showing the same wallpaper.
- **Span**: one window over the bounding box of every display. Wayland can't do this (a layer surface
  belongs to one output), so there each display shows the whole loop, and the apply says so.
- **Per display**: the wallpaper page's Apply row offers All / Main / Display 2…; applying to one
  display leaves the others playing. A display that is unplugged keeps its choice and gets it back when
  it returns. Each display's choice is remembered for "Resume last wallpaper on startup".

Displays are re-read every 2 seconds while a wallpaper runs. When they change, windows are re-laid
out; windows whose display didn't change are left alone (their loops don't restart).

## Pausing, frame rate, quality

The app sends the playback settings to the engine at startup and on every change (`set_playback`).
Every 2 seconds the monitor thread reads what the switched-on rules need and tells each wallpaper page
whether to play:

| Rule | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Pause on battery power | IOKit providing power source | `GetSystemPowerStatus` | `/sys/class/power_supply` |
| Pause when an app is fullscreen | another app's window covers the display (`CGWindowListCopyWindowInfo`) | the foreground window covers the display; exclusive D3D fullscreen pauses the main display | X11 `_NET_WM_STATE_FULLSCREEN` on the active window; not available on Wayland |
| Pause above 80% CPU | `host_statistics` | `GetSystemTimes` | `/proc/stat` |

A fullscreen app pauses only the display it covers. CPU uses hysteresis: busy after two readings above
80%, calm after two below 70%. While paused the page draws nothing; on resume it jumps to where the
clock is, still in step with the previews. Settings › General shows why playback is paused.

Frame rate limit caps how often the page draws (30, 60, or every display refresh). Render quality sets
the canvas resolution: High is full, Balanced half the pixels, Low a quarter.

## Per OS

- **macOS**: the window sits at `kCGDesktopWindowLevel`, on every Space, ignoring the mouse.
- **Windows**: the window becomes a child of the `WorkerW` that `Progman` creates behind the icons when
  sent `0x052C`. On Windows 11 24H2 and later that `WorkerW` is inside `Progman`, so the window goes
  into `Progman` just below the icon view. Removing the wallpaper re-sets the current desktop picture
  so the old frame doesn't linger. **Not yet run on a real Windows machine** (CI compiles it).
- **Linux, X11**: a `_NET_WM_WINDOW_TYPE_DESKTOP` window, kept below, on every workspace, with an
  empty input shape so clicks go through. On GNOME with the desktop-icons extension, which is also a
  desktop window, the stacking between the two is up to the window manager.
- **Linux, Wayland**: a background layer-shell surface, through `libgtk-layer-shell.so.0` loaded at run
  time (so it isn't a build dependency). Works on compositors with layer-shell (KDE, Sway, Hyprland…).
  GNOME on Wayland has no layer-shell: the app says so and suggests "GNOME on Xorg".
  **Not yet run on a real Linux desktop** (CI compiles it).

## Lock screen

No OS lets an app play a live loop on the lock screen.

- **macOS**: apps can't change the lock screen at all. The app says so.
- **Windows**: the lock screen takes a still image. "Lock screen" or "Both" renders the loop's first frame
  at the screen's resolution (`src/lib/paint.ts`) and sets it with
  `UserProfilePersonalizationSettings.TrySetLockScreenImageAsync`, falling back to
  `LockScreen.SetImageFileAsync`. Windows may refuse for unpackaged apps or where policy manages the
  lock screen; the app then shows Windows' reason.
- **Linux**: no desktop offers apps a lock-screen API. The app says so.

"Lock screen" alone leaves the desktop untouched; "Both" applies the desktop and sets the lock screen,
and reports each separately.
