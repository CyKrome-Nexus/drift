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

Where Drift sells follows the CyKrome rule in `@cykrome/sdk` (`purchaseSurface`):

- **Phone**: nothing is sold in the app. Upgrade shows **View on website**, which opens
  https://nexus.cykrome.com/drift/pro/ signed in.
- **Desktop**: the upgrade dialog lists the Drift Pro plans with prices (`payments.storefront`).
  Subscribe/Buy starts a checkout on CDS and opens the processor's payment page in the browser;
  Drift then polls the purchase (`payments.waitForPurchase`) and unlocks Pro as soon as the
  processor's webhook confirms it. "View on website" stays as the other way in. When payments are
  off, or the plans cannot be loaded, the dialog falls back to View on website.

Pro is also sold on the Pro page itself and in the CyKrome Launcher (Nexus › Plans).

The Pro page opens signed in: Drift asks CDS for a single-use handoff code
(`POST /api/auth/handoff`) and adds it as `?handoff=`, so the session token never goes into a
URL. When you come back, the plan refreshes: window focus on desktop, foreground or browser close
on the phone.

Payments are a CDS backend provider (CyKrome-Monorepo, BE-011):
`PAYMENT_PROVIDER=razorpay|stripe|cashfree|dodopayments` picks the processor, and switching is an
env change. CDS grants Pro only when the processor's signed webhook confirms payment. With
Cashfree, the desktop dialog also asks for a phone number, which Cashfree requires.

### `@cykrome/sdk`

The desktop app depends on `@cykrome/sdk` from GitHub Packages (published from CyKrome-Monorepo).
`.npmrc` maps the `@cykrome` scope to `npm.pkg.github.com`; the token is not in the repo, because
pnpm only reads it from user config or the environment:

- locally, in `~/.npmrc`: `//npm.pkg.github.com/:_authToken=<token with read:packages>`
- in CI, the `CYKROME_PACKAGES_TOKEN` secret (a token with read:packages on the CyKrome org)

### Owner setup (once)

1. Create the product: `scripts/create-drift-pro.mjs` (above). Done 2026-10-09.
2. On the CDS backend (Dokploy):
   - set `PAYMENT_PROVIDER` and that processor's keys (`RAZORPAY_*`, `STRIPE_*`, `CASHFREE_*` or `DODO_PAYMENTS_*`)
   - optionally `PAYMENT_RETURN_URL`
   See `.env.example` and BE-011 there.
3. In the admin panel, **Plans & Pricing**: create the Drift Pro plans (product `drift-pro`, price,
   monthly / yearly / one-time). Razorpay and Cashfree subscriptions need the processor's plan id,
   Dodo needs its product id for every plan. Prices are edited there later, with no deploy.
4. Point the processor's webhook at `https://api.cykrome.com/api/v1/payments/webhooks/<razorpay|stripe|cashfree|dodopayments>`.
5. Deploy the nexus site (its deploys are off until `DEPLOY_ENABLED=true`) and release the launcher.

Until steps 2 and 3, the Pro page says "Buying opens soon", the launcher's Plans section stays hidden, and
desktop Drift offers View on website only.

Note for App Store review: sending iOS users to an external purchase page for digital content is
restricted outside the regions and entitlements Apple allows (guideline 3.1.1 / 3.1.3). Check the
current rules for each storefront before submitting.
