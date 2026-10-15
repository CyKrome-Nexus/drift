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
- [x] ~~"Per display": a different wallpaper on each screen. The wallpaper page's Apply row offers All / Main / Display 2…; applying to one display leaves the others playing; an unplugged display keeps its choice for when it returns~~
- [x] ~~"Resume last wallpaper on startup" brings back each display's wallpaper with "Per display"~~
- [x] ~~Settings › General lists each display's wallpaper when they differ~~
- [x] ~~Pause on battery power (IOKit on macOS, `GetSystemPowerStatus` on Windows, `/sys/class/power_supply` on Linux)~~
- [x] ~~Pause when an app is fullscreen, only on the display it covers (window list on macOS, foreground window and D3D fullscreen on Windows, `_NET_WM_STATE_FULLSCREEN` on X11)~~
- [x] ~~Pause above 80% CPU, with hysteresis (busy after two readings above 80%, calm after two below 70%)~~
- [x] ~~Settings › General shows why playback is paused~~
- [x] ~~Frame-rate limit applied: the wallpaper page draws its own frames on a canvas, capped at 30 / 60 / every refresh~~
- [x] ~~Render quality applied: canvas at full, half (Balanced) or a quarter (Low) of the pixels~~
- [x] ~~Playback settings reach running wallpapers as soon as they change (`set_playback`)~~
- [x] ~~Paused wallpapers stop drawing and rejoin the shared clock on resume, so they stay in step with the app's preview (`driftAt` in `packages/core` matches the CSS curve)~~
- [x] ~~Follow display changes: displays re-read every 2 s while running; only windows whose display changed are rebuilt~~
- [x] ~~Windows engine: window reparented into the `WorkerW` behind the icons (into `Progman` below the icons on Windows 11 24H2+); desktop repainted on Remove~~
- [x] ~~Linux engine: X11 desktop-type window (below, sticky, click-through); Wayland background layer-shell surface via `libgtk-layer-shell.so.0` loaded at run time; GNOME on Wayland says why it can't~~
- [x] ~~Lock screen checked: no OS plays live loops there. macOS and Linux say so; Windows gets a still frame of the loop at screen resolution (`TrySetLockScreenImageAsync`, then `LockScreen.SetImageFileAsync`)~~
- [x] ~~"Lock screen" alone no longer touches the desktop; "Both" reports desktop and lock screen separately~~
- [x] ~~Tray "Remove wallpaper" / "Quit" run off the main thread, so they can't deadlock with an apply in progress~~
- [x] ~~Settings › About: engine availability is checked at run time (Linux depends on X11 / Wayland / compositor)~~
- [x] ~~`docs/engine.md`: how the engine works per OS, pause rules, displays, lock screen~~
- [x] ~~Tests: layout per display mode, pause rules, CPU hysteresis, fullscreen coverage, `/proc/stat`, frame cap and quality, canvas painting geometry, per-display apply / resume, lock screen outcomes~~
- [ ] Run the Windows engine on a real Windows 10 and Windows 11 (24H2+) machine: wallpaper behind the icons, Remove repaints, display changes, fullscreen pause
- [ ] Try the Windows lock-screen still on a real machine (Windows may refuse unpackaged apps or policy-managed lock screens)
- [ ] Run the Linux engine on X11 (GNOME on Xorg, KDE) and Wayland with layer-shell (KDE, Sway); check stacking against GNOME's desktop-icons extension
- [ ] Check on a real Mac that the canvas wallpaper looks identical to the app's CSS preview (same art, same frame)

## Content

- [x] ~~Wallpaper providers (`packages/wallpapers`): Coverr (stock video loops) and NASA (hand-picked public-domain footage), chosen by env like the backend's providers (`WALLPAPER_PROVIDERS`, `COVERR_API_KEY`); Drift's generated gradients only where no provider has anything (docs/wallpapers.md)~~
- [x] ~~Decision: no Unsplash, Pexels or Pixabay — their API terms forbid wallpaper apps or standalone redistribution; paid stock APIs later go through a Drift server, as one more provider~~
- [x] ~~Wallpaper ids are `<provider>:<id>`; favourites, lists, history and synced libraries saved as numbers become `drift:<n>`~~
- [x] ~~Provider wallpapers are free tier (Coverr's licence forbids reselling its videos); Pro keeps gating features and Drift's 5K generated masters~~
- [x] ~~Desktop: Home, Discover, search and detail read provider feeds (paged, cached 30 min, searches debounced); posters on cards, the real file in the hero and detail; credits shown~~
- [x] ~~Desktop engine plays the provider's video in each wallpaper window (file picked per display and Quality, muted, on the shared loop clock); lock screen from the poster; downloads save the file to the download folder (native, `media.rs`)~~
- [x] ~~Phone: Home, Explore, Library and detail read provider feeds; previews with `expo-video` (the provider's short clip)~~
- [x] ~~Android: live wallpaper downloads the video once and plays it with `MediaPlayer` on the wallpaper surface~~
- [x] ~~iOS: Live Photo from three seconds of the video~~
- [ ] **Owner:** get a Coverr API key (coverr.co/developers) and set `VITE_COVERR_API_KEY` / `EXPO_PUBLIC_COVERR_API_KEY` for builds; until then Ambient, Abstract and Nature show the generated set
- [ ] Watch real playback: desktop wallpaper video on macOS, Windows and Linux; the hero/detail video in `tauri dev` (Chrome's background-tab check could not)
- [ ] **Owner:** rebuild the phone dev builds (`expo-video` is a new native module), then try a Coverr and a NASA wallpaper on Android (live) and iOS (Live Photo)
- [ ] Coverr's logo next to its credit (its terms ask for Coverr attribution; Drift shows a text credit and link today)
- [ ] Portrait loops for the phone: prefer Coverr's vertical videos in phone feeds (landscape videos are cropped to the centre today)
- [ ] Phone downloads open the file in the browser; save straight to Photos / Files instead
- [ ] Download folder picker, cache size and Clear cache (desktop)
- [x] ~~Tests for providers: Coverr and NASA mapping, env selection, merging and fallback, caching, file picking, id migration, provider apply / lock screen / download on both apps, native download host rules (147 JS tests in all, plus 15 Rust)~~
- [ ] Wallpaper audio and "Mute wallpaper audio"
- [ ] Creators: follow, profiles, real ratings and apply counts
- [ ] Share links
- [ ] "See all" pages per category

## Account & Drift Pro

- [x] ~~CyKrome Account sign-in: password or emailed code (desktop), emailed code (phone)~~
- [x] ~~Session restore; app works fully signed out~~
- [x] ~~Pro read from CDS ownership; lock badges, upgrade sheet, settings fall back when Pro lapses~~
- [x] ~~Account logic shared by both apps in `packages/account/src/session.ts` (restore, plan, sync, upgrade link); details in `docs/account.md`~~
- [x] ~~Drift Pro found in the CDS catalog by slug `drift-pro`: no product-id env vars needed (`VITE_/EXPO_PUBLIC_DRIFT_PRO_PRODUCT_ID` stay as optional overrides)~~
- [x] ~~`scripts/create-drift-pro.mjs` creates the Drift Pro product (unlisted, slug `drift-pro`)~~
- [x] ~~**Owner:** created the Drift Pro product in live CDS (`drift-pro`, id `6ac87c8e56252b0c8d4d6d3b`, unlisted) with `scripts/create-drift-pro.mjs`~~
- [x] ~~CDS backend: store purchases module (App Store, Google Play, Razorpay) deployed in `a695bd03`; superseded by the payment provider below~~
- [x] ~~Phone: buy Pro in the App Store / Google Play (`expo-iap`); later removed, see below~~
- [x] ~~Desktop: "Get Drift Pro" opens the Pro page in the browser; plan refreshes when the window regains focus~~
- [x] ~~Drift Pro web page at nexus.cykrome.com/drift/pro/: merged dev → qa → main (CyKrome-Nexus #14, #15, #16), image published~~
- [x] ~~Decision: no App Store / Google Play purchases. Pro is sold on nexus.cykrome.com and in the CyKrome Launcher~~
- [x] ~~CDS backend: payments became a provider like storage (`PAYMENT_PROVIDER=razorpay|stripe`, Razorpay and Stripe adapters; switching is an env change); `/api/v1/payments` offerings, checkout, purchases, cancel, signed webhooks; App Store / Play verification removed (CyKrome-Monorepo `54f6bea4`, BE-011-Payments, on main)~~
- [x] ~~Launcher: Nexus › Plans with prices, Subscribe/Buy (opens the processor's page), active plan with renew date and Cancel; the Marketplace "Buy" button goes through checkout too (CyKrome-Monorepo `f3d10bf6`)~~
- [x] ~~Drift Pro page: pricing, checkout, plan status and Cancel; opens signed in via `?handoff=` (CyKrome-Nexus #17)~~
- [x] ~~Apps: in-app purchase removed (`expo-iap`, Restore purchases); Upgrade and Manage subscription open the Pro page signed in~~
- [x] ~~CDS backend: Cashfree and Dodo Payments processors; one checkout for every product, `GET /payments/purchases/:reference` to poll after paying (CyKrome-Monorepo `44f1fc04`)~~
- [x] ~~`@cykrome/sdk` 0.2.0 on GitHub Packages: payments client and `purchaseSurface` (phones: View on website; desktop: plans)~~
- [x] ~~Desktop: upgrade dialog lists the Pro plans and checks out, waits for the payment, unlocks Pro; phone: View on website~~
- [ ] **Owner:** add the `CYKROME_PACKAGES_TOKEN` secret (read:packages on the CyKrome org) to this repo, or CI cannot install `@cykrome/sdk`
- [x] ~~CDS backend: plans and prices live in the database (`payment_plans`), edited in the admin panel's Plans & Pricing tab; `PAYMENT_OFFERINGS` env removed (CyKrome-Monorepo `45920d98`, on dev)~~
- [x] ~~CyKrome-Nexus: #17 (Pro page checkout) and all Dependabot PRs (#4–#13) merged into dev~~
- [ ] **Owner:** payments setup on the CDS backend: `PAYMENT_PROVIDER` + keys in Dokploy, processor webhook at `…/api/v1/payments/webhooks/<provider>` (steps in `docs/account.md`)
- [ ] **Owner:** create the Drift Pro plans in the admin panel (Plans & Pricing) once the backend is deployed from dev to main
- [ ] **Owner:** CyKrome-Nexus: promote dev → qa → main and set `DEPLOY_ENABLED=true` so /drift/pro/ goes live
- [ ] **Owner:** release the launcher so Plans ships (it's merged to main; not released)
- [ ] Before iOS submission: check App Store rules on linking out to a web purchase (guideline 3.1.1 / 3.1.3) for each storefront
- [ ] **Owner:** the nexus site isn't deployed: its CI deploy job only runs with repo variable `DEPLOY_ENABLED=true` (unset), so production still serves the 2026-10-03 build and /drift/pro/ is 404 until deploys are on
- [ ] **Owner:** rebuild the phone dev builds (`expo-crypto` is a new native module; `expo-iap` is gone again)
- [x] ~~Sync favourites, lists and followed creators across devices (Pro): `GET/PUT /api/v1/drift/library` on CDS, last-writer-wins merge on the device; Settings › Account shows sync state and "Sync now"~~
- [x] ~~Offline library: Drift signs in from a saved snapshot when CyKrome can't be reached; Pro keeps working until its expiry date; "Offline" badge on the account card~~
- [x] ~~Timeout for account requests (15 s; the Account screen no longer spins forever)~~
- [x] ~~Desktop: sign-in token in the OS keychain (Keychain / Credential Manager / Secret Service); old webview token moved across on first launch~~
- [x] ~~Phone: password sign-in (plain-JS RSA-OAEP, since Hermes has no WebCrypto) and in-app sign-up~~
- [x] ~~Desktop: in-app sign-up (form, then the emailed code)~~
- [ ] Sign in against the live CyKrome server end to end. Verified live so far: public key, code request (email arrives), new purchase and sync routes deployed. Code verify not completed: Cloudflare kept dropping requests (520s and timeouts that never reached the backend, whose logs show it healthy), and the codes expired. Retry in the app, and look into the Cloudflare → origin errors
- [x] ~~Tests for accounts: plain-JS crypto, timeouts, sign-up, sync merge, offline restore, keychain migration, upgrade link (122 JS tests in all, plus 11 Rust)~~
- [ ] Desktop: no follow UI yet; followed creators synced from the phone are kept but not shown
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
- [x] ~~Follow creators from the wallpaper sheet (synced with the account for Drift Pro)~~
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
- [ ] Drift web pages: Docs, account, sign-up, privacy, terms (placeholders in `packages/core/src/about.ts`; the Pro page is done)

## Design

- [ ] Proper designs for Library, Favourites, Explore and Discover (built in the design's style, not designed)
- [ ] From the design's "try next": detail as a side panel; phone vertical swipe feed
- [ ] Light mode
