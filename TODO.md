# Drift — tracker

`[x]` done (struck through) · `[ ]` open. Keep finished items here as a record; add new ones under
the right heading.

## Foundation

- [x] ~~Monorepo: pnpm workspace, `apps/desktop` (Tauri 2), `apps/mobile` (Expo / React Native), shared `packages/*`~~
- [x] ~~Nocturne design tokens from the Claude Design handoff (`packages/tokens`)~~
- [x] ~~Shared catalog, wallpaper art, settings, Pro rules, About copy (`packages/core`)~~
- [x] ~~App icons for desktop, iOS and Android from the Drift mark~~
- [x] ~~Git repository (private, `CyKrome-Nexus/drift`) and first commit~~
- [x] ~~CI: tests, typecheck, desktop build on macOS / Windows / Linux, phone bundles for iOS and Android~~
- [x] ~~Tests for the apps themselves: desktop store, apply/resume and preview sync; phone store and wallpaper gates (62 tests in all)~~
- [ ] Component tests for screens (only logic and `Art` are tested today)

## Desktop app

- [x] ~~Home: hero carousel, Top 10, category rows~~
- [x] ~~Wallpaper detail view, add to list, favourites~~
- [x] ~~Discover, Library, Favourites, search (⌘K)~~
- [x] ~~Settings: General, Playback, Performance, Displays, Library & storage, Account, About~~
- [x] ~~Borderless window with centred traffic lights~~
- [x] ~~Window fixed at 75% of the display, centred, not resizable, not draggable~~
- [x] ~~Close hides to the tray while a wallpaper is running; Dock click brings it back~~
- [x] ~~Tray / menu-bar icon: Open Drift, Remove wallpaper, Quit~~
- [x] ~~"Show in system tray" setting controls the tray icon~~
- [x] ~~"Launch Drift at login" (off by default; login launch starts hidden)~~
- [ ] Verify "Launch at login" in a packaged build (skipped in `tauri dev` on purpose)
- [ ] Run in a real `tauri dev` window on Windows and Linux

## Wallpaper engine

- [x] ~~macOS: desktop-level window per display, behind icons, on every Space, click-through~~
- [x] ~~"Span" across all displays (one window over the combined area)~~
- [x] ~~Remove wallpaper (Settings › General and tray)~~
- [x] ~~Resume last wallpaper on startup~~
- [x] ~~Only one wallpaper layer at a time (applies serialised, resume runs once)~~
- [x] ~~App preview plays in step with the desktop wallpaper (shared loop clock)~~
- [ ] "Per display": a different wallpaper on each screen (behaves like "Same" today)
- [ ] Pause on battery power
- [ ] Pause when an app is fullscreen
- [ ] Pause above 80% CPU
- [ ] Frame-rate limit and render quality actually applied to playback
- [ ] Follow display changes (plugging in / removing a monitor while running)
- [ ] Windows engine (window behind the icons via `WorkerW`)
- [ ] Linux engine (X11 desktop window; Wayland layer-shell)
- [ ] Lock screen (macOS does not allow it; check Windows)

## Content

- [ ] Real catalog from CDS (replace the 24 placeholder gradients)
- [ ] Real video loops in the wallpaper page and previews — keep them synced via `startedAtMs`
- [ ] Thumbnails and video previews
- [ ] Downloads, download folder picker, cache size and Clear cache
- [ ] Wallpaper audio and "Mute wallpaper audio"
- [ ] Creators: follow, profiles, real ratings and apply counts
- [ ] Share links
- [ ] "See all" pages per category

## Account & Drift Pro

- [x] ~~CyKrome Account sign-in: password or emailed code (desktop), emailed code (phone)~~
- [x] ~~Session restore; app works fully signed out~~
- [x] ~~Pro read from CDS ownership; lock badges, upgrade sheet, settings fall back when Pro lapses~~
- [ ] Create the "Drift Pro" product in CDS; set `VITE_DRIFT_PRO_PRODUCT_ID` / `EXPO_PUBLIC_DRIFT_PRO_PRODUCT_ID`
- [ ] Buying Pro: Drift Pro web page; App Store / Google Play in-app purchase + server-side grant
- [ ] Sync favourites and lists across devices (backend endpoint needed)
- [ ] Offline library
- [ ] Timeout for account requests (Account screen can spin forever if CDS hangs)
- [ ] Desktop: keep the sign-in token in the OS keychain instead of webview storage
- [ ] Phone: password sign-in and in-app sign-up (optional)
- [ ] Sign in against the live CyKrome server end to end

## Phone app

- [x] ~~Home, Explore, Library, Settings, wallpaper sheet, Account, About, Upgrade~~
- [x] ~~Runs on the iOS Simulator (Expo Go)~~
- [ ] Android live wallpaper (native `WallpaperService` module)
- [ ] iOS: save the loop as a Live Photo and guide the user to Settings › Wallpaper
- [ ] Development build (needed once native wallpaper code exists), EAS build and submit
- [ ] Run on Android
- [ ] Real blur for glass on Android
- [ ] Notifications for "New from followed creators"

## Releases & pages

- [ ] Desktop updater: signing key, public key and release URL in `tauri.conf.json`, release pipeline
- [ ] macOS notarization and Windows code signing
- [ ] App Store and Google Play listings
- [ ] Drift web pages: Pro, Docs, account, sign-up, privacy, terms (placeholders in `packages/core/src/about.ts`)

## Design

- [ ] Proper designs for Library, Favourites, Explore and Discover (built in the design's style, not designed)
- [ ] From the design's "try next": detail as a side panel; phone vertical swipe feed
- [ ] Light mode
