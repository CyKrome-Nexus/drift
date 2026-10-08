#!/usr/bin/env node
// Creates the "Drift Pro" product in the CyKrome catalog (CDS), once.
//
// The apps and the backend find Drift Pro by its slug, `drift-pro`, so after this runs there is
// nothing to configure in the apps. Needs a CyKrome admin token (platform admin role):
//
//   CDS_ADMIN_TOKEN=<jwt> node scripts/create-drift-pro.mjs
//   CDS_BASE_URL=https://api.cykrome.com   (default)
//
// Prints the product id. Running it again reports the existing product instead of creating one.

const base = (process.env.CDS_BASE_URL || 'https://api.cykrome.com').replace(/\/$/, '');
const token = process.env.CDS_ADMIN_TOKEN;
const slug = 'drift-pro';

const existing = await fetch(`${base}/api/v1/catalog/products/${slug}`);
if (existing.ok) {
  const { product } = await existing.json();
  console.log(`Drift Pro already exists: ${product.productId}`);
  process.exit(0);
}
if (existing.status !== 404) throw new Error(`Catalog lookup failed: HTTP ${existing.status}`);
if (!token) {
  console.error('Set CDS_ADMIN_TOKEN to a CyKrome admin session token.');
  process.exit(1);
}

const res = await fetch(`${base}/api/v1/catalog/products`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    slug,
    name: 'Drift Pro',
    description: 'Drift Pro: Pro wallpapers, unlimited frame rate, multi-display, unlimited lists, sync and offline use.',
    publisherId: 'cykrome-nexus',
    productType: 'application',
    // Unlisted: reachable by slug for the apps, not shown in the launcher catalog.
    visibility: 'unlisted',
    website: 'https://nexus.cykrome.com/drift/pro/',
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(`Create failed: HTTP ${res.status} ${body.message ?? ''}`);
console.log(`Created Drift Pro: ${body.product.productId}`);
