// Copies the files tauri-action reported into ./staged, flat, and writes the
// updater fragment for this matrix target.
//
// Reads ARTIFACT_PATHS (JSON array) and TARGET (rust triple) from the env so no
// shell quoting is involved.
//
// The publish job merges every staged/updater-*.json into a single latest.json.
// Signatures are inlined here rather than re-read later, because this is the only
// job that has the .sig files next to the artifacts they actually signed.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Rust target triple -> the `{os}-{arch}` key Tauri's updater looks itself up by. */
export function platformKey(target) {
  const arch = target.split("-")[0]; // aarch64 | x86_64 | i686 | armv7
  if (target.includes("-apple-darwin")) return `darwin-${arch}`;
  if (target.includes("-windows-")) return `windows-${arch}`;
  if (target.includes("-linux-")) return `linux-${arch}`;
  throw new Error(`unmapped target triple: ${target}`);
}

/* Which artifact an installed copy should download to update itself. Several are
   signed on Windows (NSIS *and* MSI) — NSIS wins because it updates in place
   without an elevation prompt. First match wins. */
const UPDATE_PAYLOAD = [/-setup\.exe$/, /\.msi$/, /\.app\.tar\.gz$/, /\.AppImage$/];

export function pickPayload(names) {
  for (const rx of UPDATE_PAYLOAD) {
    const hit = names.find((n) => rx.test(n));
    if (hit) return hit;
  }
  return null;
}

/* Both macOS builds emit `Drift.app.tar.gz` — identical names that would
   overwrite each other once the four matrix legs are merged into one directory.
   Nothing else Tauri produces omits the architecture. */
export function stagedName(name, target) {
  const arch = target.split("-")[0];
  return name.replace(/\.app\.tar\.gz/, `_${arch}.app.tar.gz`);
}

function main() {
  const paths = JSON.parse(process.env.ARTIFACT_PATHS || "[]");
  const target = process.env.TARGET;
  if (!target) throw new Error("TARGET is not set");

  mkdirSync("staged", { recursive: true });

  const staged = new Map(); // staged name -> source path
  for (const p of paths) {
    // .app is a directory bundle and the .dmg already carries it
    if (!statSync(p).isFile()) continue;
    const name = stagedName(basename(p), target);
    copyFileSync(p, join("staged", name));
    staged.set(name, p);
    console.log(name);
  }

  if (staged.size === 0) {
    console.error("no distributable artifacts produced");
    process.exit(1);
  }

  // A signature is only meaningful next to the thing it signed: `<artifact>.sig`.
  const signed = [...staged.keys()].filter((n) => n.endsWith(".sig")).map((n) => n.slice(0, -4));
  const payload = pickPayload(signed);
  if (!payload) {
    console.error(
      `no signed update payload for ${target}. signed: ${signed.join(", ") || "(none)"}\n` +
        "expected bundle.createUpdaterArtifacts=true and TAURI_SIGNING_PRIVATE_KEY to be set",
    );
    process.exit(1);
  }

  const key = platformKey(target);
  const fragment = {
    [key]: {
      signature: readFileSync(join("staged", `${payload}.sig`), "utf8").trim(),
      // Resolved against the release download base by the publish job.
      asset: payload,
    },
  };
  writeFileSync(join("staged", `updater-${target}.json`), JSON.stringify(fragment, null, 2));
  console.log(`updater payload for ${key}: ${payload}`);
}

/* node collect-artifacts.mjs --selfcheck — the triple mapping and the Windows
   NSIS-over-MSI preference are the two things that silently break updates for a
   whole platform, and CI is the wrong place to find that out. */
function selfcheck() {
  assert.equal(platformKey("aarch64-apple-darwin"), "darwin-aarch64");
  assert.equal(platformKey("x86_64-apple-darwin"), "darwin-x86_64");
  assert.equal(platformKey("x86_64-unknown-linux-gnu"), "linux-x86_64");
  assert.equal(platformKey("aarch64-unknown-linux-gnu"), "linux-aarch64");
  assert.equal(platformKey("x86_64-pc-windows-msvc"), "windows-x86_64");
  assert.throws(() => platformKey("wasm32-unknown-unknown"));

  // NSIS beats MSI even when the MSI is listed first.
  assert.equal(
    pickPayload(["Drift_0.1.0_x64_en-US.msi", "Drift_0.1.0_x64-setup.exe"]),
    "Drift_0.1.0_x64-setup.exe",
  );
  assert.equal(pickPayload(["Drift.app.tar.gz"]), "Drift.app.tar.gz");
  assert.equal(pickPayload(["Drift_0.1.0_amd64.AppImage"]), "Drift_0.1.0_amd64.AppImage");
  // .deb/.rpm are never update payloads even though they ship as downloads.
  assert.equal(pickPayload(["Drift_0.1.0_amd64.deb"]), null);

  // The two macOS legs must not collide once merged into one directory.
  const a = stagedName("Drift.app.tar.gz", "aarch64-apple-darwin");
  const b = stagedName("Drift.app.tar.gz", "x86_64-apple-darwin");
  assert.equal(a, "Drift_aarch64.app.tar.gz");
  assert.notEqual(a, b);
  assert.equal(
    stagedName("Drift.app.tar.gz.sig", "x86_64-apple-darwin"),
    "Drift_x86_64.app.tar.gz.sig",
  );
  // Everything else is already unique and must pass through untouched.
  assert.equal(stagedName("Drift_0.1.0_x64.dmg", "x86_64-apple-darwin"), "Drift_0.1.0_x64.dmg");

  console.log("collect-artifacts: 13 checks passed");
}

if (process.argv.includes("--selfcheck")) selfcheck();
else main();
