/**
 * Light or dark, and where the choice is kept.
 *
 * The preference has three values but the page only ever has two: `system`
 * means "whatever the OS says right now", and it is the default so a first
 * visit matches the rest of the reviewer's machine. Once they press the
 * toggle the choice is explicit and sticks.
 *
 * Storage is guarded exactly as review drafts are (src/review/storage.ts):
 * a browser with site data blocked must cost you a colour scheme, not the
 * app. The key shares the `grading-tool:` namespace, and `loadDrafts()`
 * filters on its own prefix, so this key is invisible to it.
 */

export type Theme = 'light' | 'dark'
export type ThemePref = Theme | 'system'

export const THEME_KEY = 'grading-tool:theme'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Anything unrecognised — a hand-edited value, an old key — means system. */
export function parseThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function loadThemePref(): ThemePref {
  const store = storage()
  if (!store) return 'system'
  try {
    return parseThemePref(store.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

/** Returns false when storage refused the write; nothing depends on it. */
export function saveThemePref(pref: ThemePref): boolean {
  const store = storage()
  if (!store) return false
  try {
    if (pref === 'system') store.removeItem(THEME_KEY)
    else store.setItem(THEME_KEY, pref)
    return true
  } catch {
    return false
  }
}

/** What the OS is asking for. Dark when the browser cannot say. */
export function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function resolveTheme(pref: ThemePref, system: Theme): Theme {
  return pref === 'system' ? system : pref
}

/**
 * The one write that changes the page. `index.html` sets the same attribute
 * before first paint; this keeps it true from then on.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}
