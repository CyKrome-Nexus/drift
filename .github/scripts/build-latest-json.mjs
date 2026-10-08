// Merges the per-platform updater fragments the build matrix produced into the
// single latest.json that installed copies of Drift poll.
//
// Env: VERSION, PUBLIC_REPO (owner/repo), TAG, NOTES_FILE.
// Reads dist/updater-*.json, writes dist/latest.json and deletes the fragments so
// they are never published as release assets.
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const { VERSION, PUBLIC_REPO, TAG, NOTES_FILE } = process.env;

for (const [k, v] of Object.entries({ VERSION, PUBLIC_REPO, TAG })) {
  if (!v) {
    console.error(`::error::${k} is not set`);
    process.exit(1);
  }
}

const fragments = readdirSync(DIST).filter((f) => /^updater-.+\.json$/.test(f));
if (fragments.length === 0) {
  console.error("::error::no updater fragments found — did the build matrix run with signing enabled?");
  process.exit(1);
}

const base = `https://github.com/${PUBLIC_REPO}/releases/download/${TAG}`;
const platforms = {};

for (const f of fragments) {
  const fragment = JSON.parse(readFileSync(join(DIST, f), "utf8"));
  for (const [key, { signature, asset }] of Object.entries(fragment)) {
    if (platforms[key]) {
      console.error(`::error::two builds both claim platform ${key}`);
      process.exit(1);
    }
    if (!existsSync(join(DIST, asset))) {
      console.error(`::error::${key} points at ${asset}, which is not among the staged artifacts`);
      process.exit(1);
    }
    if (!signature) {
      console.error(`::error::${key} has an empty signature`);
      process.exit(1);
    }
    platforms[key] = { signature, url: `${base}/${asset}` };
  }
  rmSync(join(DIST, f));
}

const manifest = {
  version: VERSION,
  // Reuses the release body rather than keeping a second copy of the changelog.
  notes: NOTES_FILE && existsSync(NOTES_FILE) ? readFileSync(NOTES_FILE, "utf8").trim() : "",
  pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  platforms,
};

writeFileSync(join(DIST, "latest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ...manifest, notes: `<${manifest.notes.length} chars>` }, null, 2));
console.log(`\nplatforms covered: ${Object.keys(platforms).sort().join(", ")}`);
