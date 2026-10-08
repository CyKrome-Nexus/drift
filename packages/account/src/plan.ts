import type { CyKromeUser, Ownership } from './types';

export interface PlanState {
  plan: 'free' | 'pro';
  /** ISO date the Pro grant ends; null when it does not end or there is none. */
  expiresAt: string | null;
  /** The backend's ownershipType ("purchase", "beta", …) behind the Pro grant. */
  source: string | null;
}

export const FREE_PLAN: PlanState = { plan: 'free', expiresAt: null, source: null };

/**
 * Drift Pro is an Ownership of the Drift Pro product that has not expired.
 *
 * The product is identified by its CDS id (`proProductId`), because that is all an ownership
 * row carries. When several rows match, the one that lasts longest wins: a permanent grant beats
 * any dated one.
 */
export function resolvePlan(ownerships: readonly Ownership[], proProductId: string, now = Date.now()): PlanState {
  if (!proProductId) return FREE_PLAN;
  let best: Ownership | null = null;
  for (const o of ownerships) {
    if (o.productId !== proProductId) continue;
    if (o.expiresAt && Date.parse(o.expiresAt) <= now) continue;
    if (!best || !o.expiresAt || (best.expiresAt && Date.parse(o.expiresAt) > Date.parse(best.expiresAt))) best = o;
    if (!best.expiresAt) break;
  }
  return best ? { plan: 'pro', expiresAt: best.expiresAt, source: best.ownershipType } : FREE_PLAN;
}

export function displayName(user: CyKromeUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.username || user.email.split('@')[0];
}

export function initials(user: CyKromeUser): string {
  const name = displayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/** "Renews Nov 12, 2026" / "Lifetime" — the line under the plan name. */
export function planLine(state: PlanState, locale?: string): string {
  if (state.plan === 'free') return 'Free plan';
  if (!state.expiresAt) return state.source === 'beta' ? 'Beta access' : 'Lifetime';
  const date = new Date(state.expiresAt).toLocaleDateString(locale ?? 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `Renews ${date}`;
}
