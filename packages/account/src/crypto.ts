// Credential protection for the CDS auth handshake.
//
// This mirrors apps/website/src/App.tsx in the CyKrome monorepo exactly, and it must stay in
// step with it: the backend SHA-256-hashes nothing itself, it RSA-decrypts the payload and
// compares the result against a bcrypt hash of the *hex digest*. Sending a raw password, or a
// digest in a different encoding, authenticates against nothing.

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto is unavailable in this runtime.');
  return c.subtle;
}

/** SHA-256 as lowercase hex — the form the backend's bcrypt hash was computed over. */
export async function hashPassword(password: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', new TextEncoder().encode(password) as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Decode a PEM SPKI public key to DER bytes. */
export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return der;
}

/** RSA-OAEP(SHA-256) encrypt, base64 out. */
export async function encryptForServer(plaintext: string, publicKeyPem: string): Promise<string> {
  const key = await subtle().importKey(
    'spki',
    pemToDer(publicKeyPem) as BufferSource,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt'],
  );
  const encrypted = new Uint8Array(
    await subtle().encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(plaintext) as BufferSource),
  );
  let s = '';
  for (const b of encrypted) s += String.fromCharCode(b);
  return btoa(s);
}

/** The full client-side treatment a password gets before it leaves the device. */
export async function sealPassword(password: string, publicKeyPem: string): Promise<string> {
  return encryptForServer(await hashPassword(password), publicKeyPem);
}
