# Releasing

Drift follows the same flow as Aperture:

```
feature branch ──PR──▶ dev ──PR──▶ qa ──PR──▶ main ──▶ tag vX.Y.Z ──▶ release
```

Source lives in this **private** repository. Desktop installers are published to the
**public** [`CyKrome-Nexus/Drift-Release`](https://github.com/CyKrome-Nexus/Drift-Release),
which holds releases and a README and nothing else. The phone apps ship through the App
Store and Google Play and are not part of this flow.

```
private repo ── git push tag ──▶ GitHub Actions ──┬── macOS aarch64 + x64
                                                  ├── Windows x64
                                                  └── Linux x64
                                                        │
                                                  publish job ──▶ Drift-Release
```

## Branches

| Branch | What it holds | Gets changes from |
| --- | --- | --- |
| `dev` | Integration of finished work | Pull requests from feature branches |
| `qa` | What is being tested before release | Pull requests from `dev` |
| `main` | What has been released or is about to be | Pull requests from `qa` |

None of the three is pushed to directly:

```bash
git switch -c my-change origin/dev
git push -u origin my-change
gh pr create --base dev
# later: gh pr create --base qa --head dev, then --base main --head qa
```

This is enforced by `.githooks/pre-push`. **Every clone opts in once**, since git will
not run hooks from a repository it just cloned:

```bash
pnpm hooks        # = git config core.hooksPath .githooks
```

Tag pushes are unaffected, so the release step still works.

**This is a client-side hook, not real protection.** `git push --no-verify` skips it.
Server-side rules (rulesets / branch protection) are not available: `CyKrome-Nexus` is on
the free plan, and GitHub answers `403 Upgrade to GitHub Pro` for both on a private repo.
Once the org is on GitHub Team:

```bash
gh api -X POST repos/CyKrome-Nexus/drift/rulesets \
  -f name='Protect long-lived branches' -f target=branch -f enforcement=active \
  -f 'conditions[ref_name][include][]=refs/heads/main' \
  -f 'conditions[ref_name][include][]=refs/heads/qa' \
  -f 'conditions[ref_name][include][]=refs/heads/dev' \
  -f 'conditions[ref_name][exclude][]=' \
  -f 'rules[][type]=pull_request' \
  -f 'rules[][type]=deletion' \
  -f 'rules[][type]=non_fast_forward'
```

Then delete `.githooks/pre-push`, unset `core.hooksPath`, and add a
`required_status_checks` rule for the CI jobs, which turns CI from a signal into a gate.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request into `dev`, `qa` or `main` (and by
hand from the Actions tab):

| Job | What it checks |
| --- | --- |
| Verify | `pnpm verify`: tests for the packages and both apps, typecheck, the desktop frontend build, the release-script selfcheck and `cargo test` on Linux; then that the updater config is still releasable |
| Desktop build | `tauri build --no-bundle` on macOS and Windows, since the wallpaper engine is per-OS code |
| Phone bundles | Metro bundles the phone app for iOS and Android |

`pnpm verify` is the same command you run locally, so CI and a laptop cannot drift apart.

**CI cannot block a merge here** (same free-plan limit as above): a red run is a signal to a
human. The one real gate is the release itself: `release.yml` refuses a tag that is not on
`main`, and that runs server-side where nobody can skip it.

`.github/workflows/linux-appimage.yml` builds just a Linux AppImage from any branch, by
hand, for testing. It signs and publishes nothing.

## Cutting a release

1. On a branch into `dev`, bump the version in **`apps/desktop/package.json` only**:
   - `apps/desktop/src-tauri/tauri.conf.json` has `"version": "../package.json"`,
   - `vite.config.ts` injects the same value as `__APP_VERSION__` for Settings › About,
   - `Cargo.toml` stays at `0.0.0` and is not a version source.
2. Merge it through `dev` → `qa` → `main`.
3. Tag `main` and push the tag:

```bash
git switch main && git pull
git tag v0.1.0
git push origin v0.1.0
```

A tag with a hyphen (`v0.2.0-beta.1`) is published as a **pre-release**. Installed copies
never see pre-releases (see *Updater*), so **cut `v0.1.0`, without a hyphen, first.**

A release can be re-run for an existing tag from *Actions → Release → Run workflow*.

### What happens automatically

| Job | What it does |
| --- | --- |
| `prepare` | Refuses a tag that is not on `main` or does not match `apps/desktop/package.json`; checks every secret and variable is present and the Release Bot can reach Drift-Release; decides stable vs. pre-release; writes release notes from the commit log since the previous tag. **Fails before any build if anything is wrong.** |
| `build` (×4) | Bakes the updater endpoint, then builds macOS `aarch64` + `x86_64`, Windows `x86_64` and Linux `x86_64`, signing every updater payload. `fail-fast`, so one broken platform stops the run. |
| `publish` | Merges the per-platform fragments into `latest.json`, adds `install.sh`, `install-mac.sh` and `install-linux.sh`, checks every file is an expected installer and all four platforms are present, creates the release on Drift-Release as a **draft with everything attached**, then makes it visible in one step. It has no checkout, so it cannot push source to the public repo. |

### Published files

- macOS: `.dmg` per architecture, and `Drift_aarch64.app.tar.gz` / `Drift_x86_64.app.tar.gz` (updater payloads, also used by `install-mac.sh`)
- Windows: `.msi` and `-setup.exe`
- Linux: `.AppImage`, `.deb`, `.rpm`
- `install.sh`, `install-mac.sh`, `install-linux.sh` from `scripts/`, and `latest.json`

## Configuration

| Where | Name | Value | Status |
| --- | --- | --- | --- |
| Secret | `TAURI_SIGNING_PRIVATE_KEY` | `~/.drift/drift-updater.key` | Set |
| Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `~/.drift/drift-updater.passphrase` | Set |
| Variable | `PUBLIC_RELEASE_REPO` | `CyKrome-Nexus/Drift-Release` | Set |
| Variable | `APP_ID` | `4680217` (the org's `cykrome-nexus-release-bot` app) | Set |
| Secret | `APP_PRIVATE_KEY` | The release bot's private key (`.pem`), same as Aperture's | **Owner must set** |
| Org app | Release bot installed on `Drift-Release` | Org settings → GitHub Apps → *cykrome-nexus-release-bot* → Configure → add `Drift-Release` | Done |

```bash
gh secret set APP_PRIVATE_KEY -R CyKrome-Nexus/drift < path/to/cykrome-nexus-release-bot.private-key.pem
```

The `prepare` job checks all of these and names whatever is missing.

### The updater signing key

Generated for Drift alone (not shared with Aperture) at `~/.drift/drift-updater.key`,
protected by the 40-character passphrase in `~/.drift/drift-updater.passphrase`. The
public half is committed in `tauri.conf.json` under `plugins.updater.pubkey`, which is where
it belongs. **The private key is never committed.**

> **Back up both files** (password manager). Losing either means no installed copy can
> ever be updated again: a new key's signatures are correctly rejected by every existing
> install. Rotating is free only until the first release.

## Signing and notarisation

macOS builds are ad-hoc signed (`signingIdentity: "-"`), which turns "Drift is damaged"
into the normal unidentified-developer prompt. Notarisation needs a paid Developer ID; set
the six `APPLE_*` secrets (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) and the same build
signs and notarises. Windows code signing is not set up.

## Updater

Installed copies read
`https://github.com/CyKrome-Nexus/Drift-Release/releases/latest/download/latest.json`.
`tauri.conf.json` ships a `__PUBLIC_RELEASE_REPO__` placeholder there, and
`.github/scripts/set-updater-endpoint.mjs` fills it in during the release build, so local
builds can never update themselves.

| Platform | Update payload |
| --- | --- |
| macOS | `Drift_<arch>.app.tar.gz` |
| Windows | `Drift_<version>_x64-setup.exe` (NSIS) |
| Linux | `Drift_<version>_amd64.AppImage` — `.deb` / `.rpm` installs do not self-update |

Every payload is verified against the public key compiled into the app before it is
installed; there is no way to turn that off. `/releases/latest/` skips pre-releases, so a
beta never reaches installed copies, and if the very first release is a pre-release the
update check fails until a stable one exists.
