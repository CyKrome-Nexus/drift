// Bakes the public release repository into the updater endpoint before building.
//
// tauri.conf.json ships a `__PUBLIC_RELEASE_REPO__` placeholder rather than a real
// repository, because the endpoint is compiled into the binary and the repo name
// is deployment configuration, not source. CI substitutes it from the
// PUBLIC_RELEASE_REPO variable; a local `pnpm dev:desktop` or `pnpm build:desktop` build keeps the placeholder and
// simply fails its update check, which is the intended development behaviour.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "apps/desktop/src-tauri/tauri.conf.json";
const PLACEHOLDER = "__PUBLIC_RELEASE_REPO__";

const repo = (process.env.PUBLIC_RELEASE_REPO || "").trim();
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error(
    `::error::PUBLIC_RELEASE_REPO must be set to owner/repo (got ${repo ? `'${repo}'` : "empty"})`,
  );
  process.exit(1);
}

const raw = readFileSync(FILE, "utf8");
const conf = JSON.parse(raw);

// An unsigned build would install on an existing copy without any verification.
const pubkey = conf.plugins?.updater?.pubkey;
if (!pubkey) {
  console.error(`::error file=${FILE}::plugins.updater.pubkey is missing`);
  process.exit(1);
}

const endpoints = conf.plugins.updater.endpoints ?? [];
if (!endpoints.some((e) => e.includes(PLACEHOLDER))) {
  console.error(`::error file=${FILE}::no endpoint contains ${PLACEHOLDER}`);
  process.exit(1);
}
for (const e of endpoints) {
  if (!e.startsWith("https://")) {
    console.error(`::error file=${FILE}::updater endpoint is not https: ${e}`);
    process.exit(1);
  }
}

writeFileSync(FILE, raw.replaceAll(PLACEHOLDER, repo));
console.log(`updater endpoints -> ${endpoints.map((e) => e.replaceAll(PLACEHOLDER, repo)).join(", ")}`);
