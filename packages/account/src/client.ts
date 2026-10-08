import { sealPassword } from './crypto';
import {
  AccountApiError,
  type AccountClientOptions,
  type CyKromeUser,
  type Ownership,
  type Session,
  type TokenStore,
} from './types';

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length) return message.join(', ');
  }
  return `HTTP ${status}`;
}

/**
 * CyKrome Account client for Drift.
 *
 * Talks to the same `/api/auth/*` endpoints as the web portal and Nexus Authenticator, with the
 * same credential treatment (see crypto.ts), plus `/api/v1/me/ownership` for entitlements.
 */
export class AccountClient {
  private readonly baseUrl: string;
  private readonly brand: string;
  private readonly doFetch: typeof fetch;
  private readonly tokens: TokenStore;
  private token: string | null = null;
  private publicKeyPem: string | null = null;

  constructor(opts: AccountClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.brand = opts.brand ?? 'nexus';
    this.doFetch = opts.fetch ?? globalThis.fetch?.bind(globalThis);
    this.tokens = opts.tokenStore;
    if (!this.doFetch) throw new Error('No fetch implementation available — pass options.fetch.');
  }

  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  /** Restore a persisted session. Null when there is none or it has expired. */
  async restore(): Promise<CyKromeUser | null> {
    this.token = await this.tokens.read();
    if (!this.token) return null;
    try {
      return (await this.me()).user;
    } catch (err) {
      if (err instanceof AccountApiError && err.isAuthFailure) {
        await this.forget();
        return null;
      }
      throw err;
    }
  }

  private async request<T>(method: string, path: string, opts: { body?: unknown; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.auth !== false && this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      // The bearer token is the single source of auth; the login cookie is not usable from a
      // Tauri webview or a native app anyway.
      credentials: 'omit',
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) throw new AccountApiError(errorMessage(data, res.status), res.status, data);
    return data as T;
  }

  private async setSession(session: Session): Promise<Session> {
    this.token = session.token;
    await this.tokens.write(session.token);
    return session;
  }

  private async forget(): Promise<void> {
    this.token = null;
    await this.tokens.clear();
  }

  /** The backend rotates this key on restart, so it is fetched per process, not persisted. */
  private async publicKey(): Promise<string> {
    if (this.publicKeyPem) return this.publicKeyPem;
    const { publicKey } = await this.request<{ publicKey: string }>('GET', '/api/auth/public-key', { auth: false });
    if (!publicKey) throw new Error('CyKrome did not return an encryption key.');
    this.publicKeyPem = publicKey;
    return publicKey;
  }

  // ---- Sign-in ----

  /**
   * Needs WebCrypto RSA-OAEP, which webviews have and React Native's Hermes does not. The phone
   * app therefore signs in with an emailed code only.
   */
  async signInWithPassword(email: string, password: string): Promise<Session> {
    const sealed = await sealPassword(password, await this.publicKey());
    const session = await this.request<Session>('POST', '/api/auth/login', {
      body: { email, password: sealed, brand: this.brand },
      auth: false,
    });
    return this.setSession(session);
  }

  async requestCode(email: string): Promise<void> {
    await this.request('POST', '/api/auth/otp/request', {
      body: { email, brand: this.brand, type: 'auth' },
      auth: false,
    });
  }

  /** `brand` must be sent here too — without it the backend signs in but never links the product. */
  async signInWithCode(email: string, code: string): Promise<Session> {
    const session = await this.request<Session>('POST', '/api/auth/otp/verify', {
      body: { email, code, brand: this.brand },
      auth: false,
    });
    return this.setSession(session);
  }

  me(): Promise<{ user: CyKromeUser }> {
    return this.request('GET', '/api/auth/me');
  }

  async signOut(): Promise<void> {
    try {
      if (this.token) await this.request('POST', '/api/auth/logout');
    } catch {
      // A failed server-side logout must not strand the user in a signed-in UI.
    }
    await this.forget();
  }

  // ---- Entitlements ----

  async ownerships(): Promise<Ownership[]> {
    const { ownerships } = await this.request<{ ownerships: Ownership[] }>('GET', '/api/v1/me/ownership');
    return ownerships ?? [];
  }
}
