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

Drift sells nothing inside the apps. Pro is bought in two places:
- **https://nexus.cykrome.com/drift/pro/**, which shows prices, Subscribe/Buy, and your plan with Cancel
- **the CyKrome Launcher**: Nexus › Plans

Upgrade and "Manage subscription" in both apps open the Pro page signed in. They ask CDS for a
single-use handoff code (`POST /api/auth/handoff`) and add it as `?handoff=`, so the session
token never goes into a URL. When you come back, the plan refreshes: window focus on desktop,
foreground or browser close on the phone.

Payments are a CDS backend provider (CyKrome-Monorepo, BE-011): `PAYMENT_PROVIDER=razorpay|stripe`
picks the processor, and switching is an env change. CDS grants Pro only when the processor's
signed webhook confirms payment.

### Owner setup (once)

1. Create the product: `scripts/create-drift-pro.mjs` (above). Done 2026-10-09.
2. On the CDS backend (Dokploy):
   - set `PAYMENT_PROVIDER` and that processor's keys (`RAZORPAY_*` or `STRIPE_*`)
   - set `PAYMENT_OFFERINGS` (prices in the smallest unit; a Razorpay plan id for subscriptions)
   - optionally `PAYMENT_RETURN_URL`
   See `.env.example` and BE-011 there.
3. Point the processor's webhook at `https://api.cykrome.com/api/v1/payments/webhooks/<razorpay|stripe>`.
4. Deploy the nexus site (its deploys are off until `DEPLOY_ENABLED=true`) and release the launcher.

Until step 2, the Pro page says "Buying opens soon", and the launcher's Plans section stays hidden.

Note for App Store review: sending iOS users to an external purchase page for digital content is
restricted outside the regions and entitlements Apple allows (guideline 3.1.1 / 3.1.3). Check the
current rules for each storefront before submitting.
