// SHA-256 and RSA-OAEP(SHA-256) encryption in plain JavaScript.
//
// For runtimes without WebCrypto `subtle` — React Native's Hermes is the one that matters. The
// output is byte-for-byte what WebCrypto's RSA-OAEP produces (RFC 8017 §7.1.1, empty label), so
// the backend cannot tell the two apart. Only encryption with a public key is here: nothing
// secret is ever computed in JavaScript, so timing side channels are not a concern.
//
// Needs `BigInt` (Hermes has it) and `crypto.getRandomValues` for the OAEP seed.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((v, i) => outView.setUint32(i * 4, v));
  return out;
}

// ---- DER: just enough to read an RSA SubjectPublicKeyInfo ----

function readTlv(der: Uint8Array, at: number): { tag: number; start: number; end: number } {
  const tag = der[at];
  let len = der[at + 1];
  let start = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + der[start + i];
    start += n;
  }
  return { tag, start, end: start + len };
}

function toBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

/** The modulus and exponent of an RSA SPKI public key. */
export function parseRsaSpki(der: Uint8Array): { n: bigint; e: bigint; size: number } {
  const spki = readTlv(der, 0);
  const algorithm = readTlv(der, spki.start);
  const bitString = readTlv(der, algorithm.end);
  if (spki.tag !== 0x30 || algorithm.tag !== 0x30 || bitString.tag !== 0x03) {
    throw new Error('Not an RSA public key.');
  }
  // Skip the BIT STRING's unused-bits byte.
  const rsaKey = readTlv(der, bitString.start + 1);
  const modulus = readTlv(der, rsaKey.start);
  const exponent = readTlv(der, modulus.end);
  if (modulus.tag !== 0x02 || exponent.tag !== 0x02) throw new Error('Not an RSA public key.');

  let modBytes = der.subarray(modulus.start, modulus.end);
  while (modBytes.length && modBytes[0] === 0) modBytes = modBytes.subarray(1);
  return { n: toBigInt(modBytes), e: toBigInt(der.subarray(exponent.start, exponent.end)), size: modBytes.length };
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

function mgf1(seed: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  const block = new Uint8Array(seed.length + 4);
  block.set(seed);
  for (let counter = 0, at = 0; at < length; counter++, at += 32) {
    new DataView(block.buffer).setUint32(seed.length, counter);
    out.set(sha256(block).subarray(0, Math.min(32, length - at)), at);
  }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error('No secure random source in this runtime.');
  return c.getRandomValues(new Uint8Array(n));
}

/** RSAES-OAEP-ENCRYPT with SHA-256 and MGF1-SHA-256, empty label. */
export function rsaOaepEncrypt(message: Uint8Array, spkiDer: Uint8Array): Uint8Array {
  const { n, e, size: k } = parseRsaSpki(spkiDer);
  const hLen = 32;
  if (message.length > k - 2 * hLen - 2) throw new Error('Message too long for this key.');

  const db = new Uint8Array(k - hLen - 1);
  db.set(sha256(new Uint8Array(0)));
  db[db.length - message.length - 1] = 0x01;
  db.set(message, db.length - message.length);

  const seed = randomBytes(hLen);
  const dbMask = mgf1(seed, db.length);
  for (let i = 0; i < db.length; i++) db[i] ^= dbMask[i];
  const seedMask = mgf1(db, hLen);
  for (let i = 0; i < hLen; i++) seed[i] ^= seedMask[i];

  const em = new Uint8Array(k);
  em.set(seed, 1);
  em.set(db, 1 + hLen);

  let c = modPow(toBigInt(em), e, n);
  const out = new Uint8Array(k);
  for (let i = k - 1; i >= 0; i--) {
    out[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  return out;
}
