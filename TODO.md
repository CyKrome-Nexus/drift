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
- [x] ~~Mac installer picks the right file on Intel Macs (`x86_64`, not `x64`)~~
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
- [x] ~~Android live wallpaper (native `WallpaperService` in `modules/drift-wallpaper`): draws the art natively, honours frame rate and "Pause in Low Power Mode", stops while hidden~~
- [x] ~~Android: first apply opens the system preview (home or home + lock chosen there); later applies swap in place~~
- [x] ~~iOS: render the loop as a Live Photo (`.mov` + JPEG with matching identifier), save to Photos, guide screen for Settings › Wallpaper~~
- [x] ~~iOS: one tap saves the Live Photo, shows a hint, then opens Photos (`photos-redirect://`); the in-app guide is the fallback~~
- [x] ~~iOS: tap-through on the simulator reaches Apple's wallpaper editor (Set as wallpaper → Photos → Share › Use as Wallpaper)~~
- [ ] iOS: the simulator's wallpaper editor shows the Drift photo black. The saved JPEG and MOV render correctly and share their Live Photo identifier, so this is probably the simulator. Check a stock photo in the same editor, then on a real iPhone
- [ ] iOS: watch App Review for `photos-redirect://` (undocumented URL); if rejected, fall back to the in-app guide only
- [x] ~~iOS experiment: Settings › iPhone wallpaper › "Set with Shortcut" runs the user's "Drift Wallpaper" Apple Shortcut after saving (one tap); setup screen with build steps; falls back to Photos~~
- [ ] iOS experiment: try the Shortcut flow on a real iPhone (does it keep the Live Photo motion? how often does iOS ask to allow it?) and decide between it and the Photos handoff
- [ ] If the Shortcut flow stays: publish a ready-made "Drift Wallpaper" shortcut as an iCloud link so users tap Add instead of building it
- [x] ~~Expo Go says the wallpaper needs the Drift build instead of failing~~
- [x] ~~Development build: `expo-dev-client`, `pnpm ios` / `pnpm android` now run `expo run:*`; built and running on the iOS Simulator and the Android emulator~~
- [x] ~~`eas.json` profiles: development, development-simulator, preview, production; submit profile~~
- [ ] **Owner:** `eas login`, `eas init` (expo.dev project + `projectId`), first `eas build`, then `eas submit` (steps in `docs/phone.md`)
- [x] ~~Run on Android (Pixel 8 emulator, Android dev build)~~
- [x] ~~Real blur for glass on Android (`BlurTargetView`; tab bar blurs the current tab, wallpaper sheet blurs the art)~~
- [x] ~~Follow creators from the wallpaper sheet (kept on the phone until accounts sync)~~
- [x] ~~Notifications for "New from followed creators": permission asked when turned on, check on launch and return to the app, tap opens the wallpaper~~
- [ ] Server push for followed creators while Drift is closed (needs the real catalog and a push endpoint)
- [x] ~~Toasts were invisible on Android (behind the native screens); fixed with elevation~~
- [x] ~~Local iOS builds work from a path with spaces: `expo-constants` podspec patch, `withSpaceSafeBundlePhase` config plugin~~
- [x] ~~CI compiles the Android native project on every PR~~
- [x] ~~`docs/phone.md`: running dev builds, how wallpapers are set, EAS steps~~
- [x] ~~Tests for the native wallpaper flows, notifications and following (79 tests in all)~~

## Branches, CI & releases

Flow: feature → `dev` → `qa` → `main` → tag `vX.Y.Z` → release (as Aperture). Details in `docs/releasing.md`.

- [x] ~~`dev` and `qa` branches created from `main`~~
- [x] ~~Pre-push hook blocks direct pushes to `dev`, `qa`, `main` (`pnpm hooks` to opt in per clone)~~
- [x] ~~CI runs on pull requests into `dev`, `qa`, `main`: `pnpm verify`, desktop builds on macOS and Windows, phone bundles~~
- [x] ~~`pnpm verify`: tests, typecheck, desktop frontend build, release-script selfcheck, `cargo test`~~
- [x] ~~Release workflow on `v*` tags: tag must be on `main` and match `apps/desktop/package.json`; builds macOS arm64 + Intel, Windows, Linux; publishes to Drift-Release as draft, then visible~~
- [x] ~~Public `CyKrome-Nexus/Drift-Release` repo with install README~~
- [x] ~~Updater signing key for Drift (`~/.drift`), public key in `tauri.conf.json`, signed updater artifacts on~~
- [x] ~~Repo secrets `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD`, variables `APP_ID`, `PUBLIC_RELEASE_REPO`~~
- [x] ~~Signed macOS updater bundle built locally (`Drift.app.tar.gz` + `.sig`)~~
- [x] ~~Installer scripts (`install.sh`, `install-mac.sh`, `install-linux.sh`) attached to every release~~
- [x] ~~Manual Linux AppImage test-build workflow~~
- [x] ~~CI desktop build on Windows runs under bash (PowerShell broke the `--config` JSON)~~
- [x] ~~CI green on the release-pipeline PR (#1): Verify, macOS, Windows, phone bundles~~
- [x] ~~**Owner:** add `Drift-Release` to the `cykrome-nexus-release-bot` app's repositories~~
- [x] ~~**Owner:** set secret `APP_PRIVATE_KEY` on `CyKrome-Nexus/drift` — the release bot's GitHub App private key (`.pem`)~~
- [ ] Back up `~/.drift/drift-updater.key` and `.passphrase` to a password manager
- [ ] Merge the release-pipeline PR through `dev` → `qa` → `main`
- [ ] First release `v0.1.0` (no hyphen, so the updater has a stable release to find)
- [ ] Real branch protection once the org is on GitHub Team (ruleset command in `docs/releasing.md`)
- [ ] Phone release flow (EAS build and submit) — not part of the tag release

## Releases & pages

- [ ] macOS notarization and Windows code signing
- [ ] App Store and Google Play listings
- [ ] Drift web pages: Pro, Docs, account, sign-up, privacy, terms (placeholders in `packages/core/src/about.ts`)

## Design

- [ ] Proper designs for Library, Favourites, Explore and Discover (built in the design's style, not designed)
- [ ] From the design's "try next": detail as a side panel; phone vertical swipe feed
- [ ] Light mode
