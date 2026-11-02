// Bring your own keys: wallpaper sources as connections.
//
// Drift ships with no stock-video API keys. Each person adds their own free keys (the welcome
// screen, Settings › Wallpaper sources), so every request is that person's own, under their own
// account and quota: personal use.
//
// A connection is one key for one provider, with a name the person chooses ("Pexels", "Pexels —
// work account"). There can be several of a type: their keys fall over in order when one is
// refused or spent (failover.ts), which adds up their free allowances. The apps keep the list of
// connections in ordinary storage and each key in the OS credential store (desktop) or Secure
// Store (phone), never in the build.
//
// A key set at build time (PEXELS_API_KEY in .env) still works, for development, after the
// user's own keys.

import type { WallpaperConfig } from './config';
import type { Fetch } from './types';

export type ConnectionType = 'pexels' | 'pixabay' | 'coverr';

export interface Connection {
  /** `<type>-<random>`, stable: the key is stored under it. */
  id: string;
  type: ConnectionType;
  /** What the person calls it. Shown in Settings only; credits always name the provider. */
  name: string;
}

export interface ConnectionTypeInfo {
  type: ConnectionType;
  label: string;
  /** One line on what it brings. */
  what: string;
  /** The free plan's limit, as the provider states it. */
  limits: string;
  /** Where a signed-in person creates or reads their key. */
  keyUrl: string;
  /** What to do there, in order. */
  steps: readonly string[];
}

/** The providers a connection can be for, in the order Drift offers them. */
export const CONNECTION_TYPES: readonly ConnectionTypeInfo[] = [
  {
    type: 'pexels',
    label: 'Pexels',
    what: 'The largest free library of stock video, with tall loops for phones.',
    limits: '200 requests an hour, free',
    keyUrl: 'https://www.pexels.com/api/new/',
    steps: ['Sign up or log in to Pexels.', 'Fill in the short form (a personal project is fine) and accept the terms.', 'Copy your API key and paste it here.'],
  },
  {
    type: 'pixabay',
    label: 'Pixabay',
    what: 'Free stock video, strongest on nature, backgrounds and abstract motion.',
    limits: '100 requests a minute, free',
    keyUrl: 'https://pixabay.com/api/docs/',
    steps: ['Sign up or log in to Pixabay.', 'On the API documentation page, find “Your API key” under Parameters.', 'Copy it and paste it here.'],
  },
  {
    type: 'coverr',
    label: 'Coverr',
    what: 'Curated stock video loops, many made to sit behind content.',
    limits: '50 requests an hour, free',
    keyUrl: 'https://coverr.co/developers',
    steps: ['Sign up or log in to Coverr.', 'Create an application on the developers page.', 'Copy its API key and paste it here.'],
  },
];

export function typeInfo(type: ConnectionType): ConnectionTypeInfo {
  return CONNECTION_TYPES.find((t) => t.type === type)!;
}

export function isConnectionType(value: unknown): value is ConnectionType {
  return CONNECTION_TYPES.some((t) => t.type === value);
}

const ID = /^(pexels|pixabay|coverr)-[a-z0-9]{4,32}$/;

export function newConnectionId(type: ConnectionType, random: () => number = Math.random): string {
  let tail = '';
  while (tail.length < 10) tail += Math.floor(random() * 36).toString(36);
  return `${type}-${tail}`;
}

/** "Pexels" for the first of a type, then "Pexels 2", "Pexels 3"… skipping names in use. */
export function defaultName(type: ConnectionType, existing: readonly Pick<Connection, 'name'>[]): string {
  const label = typeInfo(type).label;
  const taken = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  if (!taken.has(label.toLowerCase())) return label;
  for (let n = 2; ; n++) if (!taken.has(`${label} ${n}`.toLowerCase())) return `${label} ${n}`;
}

/** A name as typed: trimmed, at most 40 characters; empty falls back to the type's label. */
export function cleanName(name: string, type: ConnectionType): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 40) || typeInfo(type).label;
}

/** Saved connections as read back from storage: well-formed ones only, each id once. */
export function sanitizeConnections(raw: unknown): Connection[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Connection[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const { id, type, name } = c as Record<string, unknown>;
    if (typeof id !== 'string' || !ID.test(id) || !isConnectionType(type) || !id.startsWith(`${type}-`) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, type, name: typeof name === 'string' ? cleanName(name, type) : typeInfo(type).label });
  }
  return out;
}

/**
 * `config` with the user's connections: each type's keys in the order the connections are
 * listed, then any key from the build. A type with a key is switched on, in the order its first
 * connection appears, ahead of whatever else the build lists.
 */
export function withConnections(config: WallpaperConfig, connections: ReadonlyArray<Connection & { key: string }>): WallpaperConfig {
  const out: WallpaperConfig = { ...config, providers: [...config.providers] };
  const keyed = connections.filter((c) => c.key.trim());
  const types = [...new Set(keyed.map((c) => c.type))];
  for (const type of types) {
    const own = keyed.filter((c) => c.type === type).map((c) => c.key.trim());
    const built = config[type];
    const keys = [...new Set([...own, ...(built ? [built.apiKey, ...(built.apiKeys ?? [])] : [])])];
    out[type] = { ...(built ?? {}), apiKey: keys[0], apiKeys: keys.slice(1) };
  }
  // The user's types first, in their order; then the rest of the build's list.
  out.providers = [...types, ...out.providers.filter((p) => !types.includes(p as ConnectionType))];
  return out;
}

export type KeyCheck = 'ok' | 'invalid' | 'unreachable';

/**
 * Whether `key` works, with one small request. A refused key is "invalid"; anything else that
 * fails (offline, 5xx, rate limited) is "unreachable", not a verdict on the key.
 */
export async function verifyKey(type: ConnectionType, key: string, fetch: Fetch): Promise<KeyCheck> {
  const k = key.trim();
  if (!k) return 'invalid';
  const refused = (status: number) => status === 400 || status === 401 || status === 403;
  try {
    const res =
      type === 'pexels'
        ? await fetch('https://api.pexels.com/videos/popular?per_page=1', { headers: { Authorization: k } })
        : type === 'pixabay'
          ? await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(k)}&per_page=3`)
          : await fetch('https://api.coverr.co/videos?page_size=1', { headers: { Authorization: `Bearer ${k}` } });
    if (res.ok) return 'ok';
    return refused(res.status) ? 'invalid' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
