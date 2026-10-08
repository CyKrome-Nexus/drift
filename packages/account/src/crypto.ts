// Credential protection for the CDS auth handshake.
//
// This mirrors apps/website/src/App.tsx in the CyKrome monorepo exactly, and it must stay in
// step with it: the backend SHA-256-hashes nothing itself, it RSA-decrypts the payload and
// compares the result against a bcrypt hash of the *hex digest*. Sending a raw password, or a
// digest in a different encoding, authenticates against nothing.

//
// Webviews and Node have WebCrypto; Hermes (the phone) does not, so each step falls back to the
// plain-JS equivalent in rsa.ts, which produces the same bytes.

import { rsaOaepEncrypt, sha256 } from './rsa';

function subtle(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

/** SHA-256 as lowercase hex — the form the backend's bcrypt hash was computed over. */
export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const s = subtle();
  const digest = s ? new Uint8Array(await s.digest('SHA-256', bytes as BufferSource)) : sha256(bytes);
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  const message = new TextEncoder().encode(plaintext);
  const s = subtle();
  let encrypted: Uint8Array;
  if (s) {
    const key = await s.importKey(
      'spki',
      pemToDer(publicKeyPem) as BufferSource,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt'],
    );
    encrypted = new Uint8Array(await s.encrypt({ name: 'RSA-OAEP' }, key, message as BufferSource));
  } else {
    encrypted = rsaOaepEncrypt(message, pemToDer(publicKeyPem));
  }
  let binary = '';
  for (const b of encrypted) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The full client-side treatment a password gets before it leaves the device. */
export async function sealPassword(password: string, publicKeyPem: string): Promise<string> {
  return encryptForServer(await hashPassword(password), publicKeyPem);
}
