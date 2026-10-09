export interface CyKromeUser {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  [k: string]: unknown;
}

export interface Session {
  token: string;
  user: CyKromeUser;
}

/** One row of `GET /api/v1/me/ownership` — the user's entitlement to a CyKrome product. */
export interface Ownership {
  ownershipId: string;
  productId: string;
  ownershipType: string;
  grantedAt: string;
  /** ISO date. Null for a permanent grant; set for subscriptions and betas. */
  expiresAt: string | null;
}

/** Where the session token lives between launches. Each app supplies its own. */
export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AccountClientOptions {
  /** CDS base URL, e.g. https://api.cykrome.com */
  baseUrl: string;
  /**
   * Brand tag. The backend uses it to pick email templates and to link the account to the
   * Nexus product line on sign-in, so it is not cosmetic.
   */
  brand?: string;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  /** Per-request deadline. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface SignUpDetails {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  /** Optional: an account without one signs in by emailed code. */
  password?: string;
}

export class AccountApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
    this.name = 'AccountApiError';
  }
  /** The token is missing or expired; the UI should fall back to signed-out. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** CDS did not answer within the client's deadline. */
export class AccountTimeoutError extends Error {
  constructor() {
    super('CyKrome is taking too long to answer. Try again in a moment.');
    this.name = 'AccountTimeoutError';
  }
}

/**
 * What an app remembers about the account between launches, so Drift (and Drift Pro) keeps
 * working with no connection. Ownerships carry their own expiry, so a lapsed plan still lapses
 * offline.
 */
export interface AccountSnapshot {
  user: CyKromeUser;
  ownerships: Ownership[];
  proProductId: string | null;
  savedAt: number;
}
