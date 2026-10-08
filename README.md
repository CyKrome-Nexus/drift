# Drift

Live wallpapers for desktop and phone, published under CyKrome Nexus. Implemented from the
Claude Design handoff (`DesktopApp`, `PhoneApp`, `styles.css` — the "Nocturne" system).

One pnpm workspace, two apps, three shared packages:

| Path | What | Stack |
| --- | --- | --- |
| `apps/desktop` | macOS, Windows, Linux | Tauri 2 + React 19 + Vite |
| `apps/mobile` | iOS, Android | Expo SDK 57 (React Native 0.86) + Expo Router |
| `packages/core` | Catalog, wallpaper art, settings models, Drift Pro rules, About copy | TypeScript, no deps |
| `packages/account` | CyKrome Account client and plan resolution | TypeScript, WebCrypto |
| `packages/tokens` | Nocturne design tokens — `tokens.css` for desktop, `index.ts` for phone | — |

Everything the two apps must agree on — which wallpapers exist, what Pro unlocks, how a plan is
read from an account, what About says — lives in a package, so the apps differ only in UI.

## Quick start

```bash
pnpm install
pnpm test                 # packages and both apps (62 tests)
pnpm typecheck
pnpm verify               # everything CI checks, incl. cargo test
pnpm hooks                # once per clone: block direct pushes to dev/qa/main

pnpm dev:desktop          # tauri dev (Vite on :1420)
pnpm dev:mobile           # expo start; press i / a
```

The desktop UI also runs in a plain browser (`pnpm --filter @drift/desktop dev`) for design
work; window controls, updates and the engine no-op there.

Copy `apps/desktop/.env.example` → `.env` and `apps/mobile/.env.example` → `.env` to configure.

## Branches, CI and releases

Same flow as Aperture: feature branch → `dev` → `qa` → `main` → tag `vX.Y.Z` → release.
Every hop is a pull request; run `pnpm hooks` once per clone so git refuses direct pushes
to the three branches. CI (`pnpm verify`, desktop builds, phone bundles) runs on every pull
request. A `v*` tag on `main` builds and signs the desktop app for macOS, Windows and Linux
and publishes it to the public
[Drift-Release](https://github.com/CyKrome-Nexus/Drift-Release) repo.
Everything — setup, secrets, the signing key — is in **[docs/releasing.md](docs/releasing.md)**.

## CyKrome Account

Both apps sign in against CDS (`https://api.cykrome.com` by default) using the same
`/api/auth/*` endpoints and credential treatment as the web portal and Nexus Authenticator:
`SHA-256(password)` hex, RSA-OAEP sealed under the server's rotating key. `brand: "nexus"` is
sent on every auth call so the backend links the account to the Nexus product line.

- **Desktop**: password or emailed code. Token in the webview's localStorage (same trade-off as
  Authenticator; moving it to the OS keychain is a follow-up).
- **Phone**: emailed code only — Hermes has no WebCrypto RSA-OAEP, so password sealing is not
  available. Token in the iOS Keychain / Android Keystore via `expo-secure-store`.

### Drift Pro

Pro is **an unexpired Ownership of the Drift Pro product** (`GET /api/v1/me/ownership`). The
backend already supports this; no new endpoints are needed. To turn it on:

1. Create a "Drift Pro" product in CDS and note its id.
2. Set `VITE_DRIFT_PRO_PRODUCT_ID` (desktop) and `EXPO_PUBLIC_DRIFT_PRO_PRODUCT_ID` (phone).
3. Grant ownership with `POST /api/v1/ownership/grant` — `expiresAt` for subscriptions, null for
   lifetime.

Without the product id every account reads as Free, and Settings › Account says so.

What Pro unlocks is defined once, in `packages/core/src/premium.ts`:

| Feature | Gate |
| --- | --- |
| Pro wallpapers (5K masters) | Apply / download |
| Unlimited frame rate | Desktop "Unlimited", phone "120" |
| Span & per-display | Desktop "Multiple displays" |
| Unlimited lists | Free keeps one list |
| Sync everywhere | Marked **Soon** — not built |
| Offline library | Marked **Soon** — not built |

When a plan lapses, Pro-only settings fall back to their free defaults (`clampToPlan`).
"Upgrade" opens the Drift Pro page in the browser; the plan is re-read when the app regains
focus.

## Settings › About

Modelled on Aperture's: identity block, quick actions (Documentation, Copy diagnostics, Mail to
Founder), Updates, a Build ledger, the CyKrome Nexus publisher block, and the legal line. On the
phone, Updates points at the App Store / Google Play instead of offering a check.

## Status

What is done and what is left lives in **[TODO.md](TODO.md)**. In short: the macOS wallpaper
engine works; Windows, Linux and the phones do not have one yet, and the catalog is still the
design's placeholder art.

## Gotchas

- **Imports in shared packages are extensionless** (`'./catalog'`, not `'./catalog.js'`) —
  Metro does not map `.js` specifiers onto `.ts` files.
- **Never inject `<style>` at runtime on desktop** — Tauri's CSP nonce drops it. Import CSS.
- **Android glass** — `expo-blur` only blurs inside a `BlurTargetView` on Android, so the glass
  surfaces there use a translucent fill with the same sheen. iOS uses real blur.
- **Use `npx expo install`** for anything native in `apps/mobile` so versions match SDK 57.
