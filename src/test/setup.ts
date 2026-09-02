import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

/**
 * Node 22+ ships an experimental `localStorage` global that reads back as
 * undefined without `--localstorage-file`, and Vitest's jsdom environment
 * will not overwrite a global that already exists — so jsdom's working
 * implementation never lands and every test that touches a draft dies in
 * setup. jsdom's own Storage is unreachable from here (`window` is
 * `globalThis` under Vitest), so stand up a plain one.
 *
 * The store only ever gets, sets, removes and clears; a real browser's
 * localStorage is covered end to end by dev/test-drive.mjs.
 */
class MemoryStorage {
  private items = new Map<string, string>()

  get length(): number {
    return this.items.size
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.items.get(String(key)) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(String(key), String(value))
  }

  removeItem(key: string): void {
    this.items.delete(String(key))
  }

  clear(): void {
    this.items.clear()
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: new MemoryStorage(),
})

afterEach(() => {
  localStorage.clear()
})
