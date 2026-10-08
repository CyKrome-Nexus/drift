export * from './types';
export * from './crypto';
export { rsaOaepEncrypt, sha256 } from './rsa';
export * from './client';
export * from './plan';

export function memoryTokenStore(initial: string | null = null) {
  let token = initial;
  return {
    async read() { return token; },
    async write(t: string) { token = t; },
    async clear() { token = null; },
  };
}
export * from './sync';
export * from './session';
