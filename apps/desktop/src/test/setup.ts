// Node has no webview storage; a Map-backed one is enough for the store.
import { beforeEach } from 'vitest';

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
  removeItem(key: string) { this.items.delete(key); }
  clear() { this.items.clear(); }
}

(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();

beforeEach(() => localStorage.clear());
