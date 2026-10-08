# CyKrome Account, Drift Pro, sync and purchases

The account code lives in `packages/account` and is shared by both apps:

| File | What it does |
|---|---|
| `client.ts` | CDS HTTP client: sign-in (password or emailed code), sign-up, ownerships, catalog lookup, purchase reports, checkout. Every request has a 15 s deadline. |
| `crypto.ts`, `rsa.ts` | Seals the password exactly as the web portal does: SHA-256 hex, then RSA-OAEP. `rsa.ts` is a plain-JS fallback for Hermes, which has no WebCrypto. |
| `session.ts` | Session restore (online and offline), the Drift Pro plan, sync scheduling, applying purchases. Each app passes a small host adapter (`apps/*/src/lib/account.ts`). |
| `sync.ts` | Library sync: last-writer-wins registers per favourite, list and followed creator. |

## Drift Pro

Drift Pro is the CDS catalog product with slug **`drift-pro`**. A user has Pro while they hold an
unexpired Ownership of it. The apps and the backend both look the product up by slug, so there
is nothing to configure in the apps. `VITE_DRIFT_PRO_PRODUCT_ID` and
`EXPO_PUBLIC_DRIFT_PRO_PRODUCT_ID` still work as optional overrides.

Create the product once (needs a CyKrome admin token):

```sh
CDS_ADMIN_TOKEN=<jwt> node scripts/create-drift-pro.mjs
```

## Offline

After every successful plan check the app saves a snapshot: the user, their ownerships and the
Pro product id (desktop: webview storage; phone: AsyncStorage). If CyKrome cannot be reached at
launch (offline, timeout, 5xx), the app signs in from the snapshot and shows an **Offline** badge.
Pro then comes from the saved ownerships, which still expire on their date. A 401 signs out and
deletes the snapshot.

## Sync (Pro)

`GET/PUT /api/v1/drift/library` on CDS. Edits are stamped when they happen. Sync runs:
- on sign-in
- on every plan refresh (window focus on desktop, app foreground on phone)
- 1.5 s after a local edit
- from "Sync now" in Settings › Account

The server only checks revisions; the merge happens on the device.
See `docs/architecture/backend/BE-011-Store-Purchases.md` in CyKrome-Monorepo.

## Tokens

- Desktop: the OS credential store (Keychain / Credential Manager / Secret Service) through
  `src-tauri/src/secrets.rs`. A token left in webview storage by an older build is moved there
  on first launch.
- Phone: `expo-secure-store` (Keychain / Keystore).

## Buying Pro

| Where | How | Verified by CDS through |
|---|---|---|
| iPhone | StoreKit 2 via `expo-iap`, `appAccountToken` = account id as UUID | Apple's signature chain |
| Android | Play Billing via `expo-iap`, `obfuscatedAccountId` = account id | Reading the purchase from Google |
| Desktop | `POST /purchases/razorpay/checkout` → Razorpay page in the browser | Razorpay webhook HMAC |

A purchase is reported to CDS before the store transaction is finished. If CDS cannot be reached,
the transaction stays open and the store delivers it again. "Restore purchases" on the phone
reports everything the store still holds. The Pro page is https://nexus.cykrome.com/drift/pro/.

### Owner setup (once)

1. Create the product: `scripts/create-drift-pro.mjs` (above).
2. App Store Connect: an auto-renewable subscription (e.g. `com.cykrome.drift.pro.yearly`); set
   the Server Notifications V2 URL to `https://api.cykrome.com/api/v1/purchases/apple/notifications`.
3. Play Console: a subscription (e.g. `drift_pro`) with a base plan; real-time developer
   notifications to `…/api/v1/purchases/google/notifications?token=<secret>`; a service account
   with order access.
4. Razorpay: a plan; webhook `…/api/v1/purchases/razorpay/webhook` for `subscription.*`.
5. On the CDS backend in Dokploy, set `STORE_PRODUCTS`, `APPLE_BUNDLE_IDS`,
   `GOOGLE_PLAY_SERVICE_ACCOUNT`, `GOOGLE_PLAY_PACKAGES`, `GOOGLE_PLAY_RTDN_TOKEN` and the
   `RAZORPAY_*` keys (see `.env.example` there). A store with no settings simply shows no buy
   button: the phone falls back to the Pro web page, and desktop opens it too.
6. Rebuild the phone app: `expo-iap` and `expo-crypto` are native modules (`pnpm ios` / `pnpm android`, or EAS).
