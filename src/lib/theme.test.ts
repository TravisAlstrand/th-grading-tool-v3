import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_KEY,
  applyTheme,
  loadThemePref,
  parseThemePref,
  resolveTheme,
  saveThemePref,
  systemTheme,
} from './theme'

/**
 * The preference outlives the session, so a bad value read back from storage
 * must degrade to "follow the OS" rather than throw on boot.
 */

function mockMatchMedia(light: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: light,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
})

describe('parseThemePref', () => {
  it('keeps the two explicit values', () => {
    expect(parseThemePref('light')).toBe('light')
    expect(parseThemePref('dark')).toBe('dark')
  })

  it('treats anything else as system', () => {
    for (const value of [null, undefined, '', 'Dark', 'auto', 0, {}]) {
      expect(parseThemePref(value)).toBe('system')
    }
  })
})

describe('resolveTheme', () => {
  it('passes an explicit preference straight through', () => {
    expect(resolveTheme('light', 'dark')).toBe('light')
    expect(resolveTheme('dark', 'light')).toBe('dark')
  })

  it('defers to the system theme when the preference is system', () => {
    expect(resolveTheme('system', 'light')).toBe('light')
    expect(resolveTheme('system', 'dark')).toBe('dark')
  })
})

describe('systemTheme', () => {
  it('reads the OS preference', () => {
    mockMatchMedia(true)
    expect(systemTheme()).toBe('light')
    mockMatchMedia(false)
    expect(systemTheme()).toBe('dark')
  })

  it('falls back to dark when the browser cannot say', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('unsupported')
    })
    expect(systemTheme()).toBe('dark')
  })
})

describe('the stored preference', () => {
  it('round-trips an explicit choice', () => {
    expect(saveThemePref('light')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(loadThemePref()).toBe('light')
  })

  it('clears the key when the preference goes back to system', () => {
    saveThemePref('dark')
    saveThemePref('system')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(loadThemePref()).toBe('system')
  })

  it('reads a junk value as system rather than throwing', () => {
    localStorage.setItem(THEME_KEY, 'chartreuse')
    expect(loadThemePref()).toBe('system')
  })

  it('survives storage being unavailable', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('site data blocked')
      },
    })
    expect(loadThemePref()).toBe('system')
    expect(saveThemePref('light')).toBe(false)
  })

  it('uses a key the draft loader ignores', () => {
    // loadDrafts() walks every key and filters on 'grading-tool:draft:'.
    expect(THEME_KEY.startsWith('grading-tool:draft:')).toBe(false)
  })
})

describe('applyTheme', () => {
  it('writes the attribute the light palette is selected by', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
