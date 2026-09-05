/**
 * chrome-mock.js — a minimal, promise-based fake of the chrome.* surface the
 * core modules touch.
 *
 * Deliberately small. It exists because core/ was designed to take the chrome
 * namespace by injection (ARCHITECTURE.md §1), so the only thing that needs
 * faking is storage. If this file ever has to grow a lot, that is a signal that
 * platform knowledge has leaked out of the shell and into the core.
 */

class Area {
  constructor() { this.data = new Map(); }

  async get(key) {
    if (key === null || key === undefined) return Object.fromEntries(this.data);
    if (Array.isArray(key)) {
      const out = {};
      for (const k of key) if (this.data.has(k)) out[k] = this.data.get(k);
      return out;
    }
    if (typeof key === 'object') {
      const out = {};
      for (const [k, fallback] of Object.entries(key)) {
        out[k] = this.data.has(k) ? this.data.get(k) : fallback;
      }
      return out;
    }
    return this.data.has(key) ? { [key]: this.data.get(key) } : {};
  }

  async set(items) {
    for (const [k, v] of Object.entries(items)) {
      // Round-trip through JSON: chrome.storage serialises, so a test that
      // accidentally relies on object identity or a Map surviving would pass
      // here and fail in the browser.
      this.data.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    }
  }

  async remove(key) {
    for (const k of Array.isArray(key) ? key : [key]) this.data.delete(k);
  }

  async clear() { this.data.clear(); }
}

export function createChromeMock() {
  return {
    storage: { local: new Area(), session: new Area() },
    runtime: { lastError: null }
  };
}

/** A chrome mock with no session area, to exercise the degraded path. */
export function createChromeMockWithoutSession() {
  const ns = createChromeMock();
  delete ns.storage.session;
  return ns;
}
