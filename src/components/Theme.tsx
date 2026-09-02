import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  applyTheme,
  loadThemePref,
  resolveTheme,
  saveThemePref,
  systemTheme,
  type Theme,
  type ThemePref,
} from '@/lib/theme'
import { Button } from './primitives'

type ThemeState = {
  /** What is actually on screen. */
  theme: Theme
  /** What the reviewer asked for, which may be 'system'. */
  pref: ThemePref
  toggle: () => void
}

const ThemeContext = createContext<ThemeState>({
  theme: 'dark',
  pref: 'system',
  toggle: () => {},
})

export function useTheme(): ThemeState {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPref] = useState<ThemePref>(() => loadThemePref())
  const [system, setSystem] = useState<Theme>(() => systemTheme())

  // Only matters while the preference is 'system', but the listener is cheap
  // and keeping it unconditional avoids a subscribe/unsubscribe on every
  // toggle.
  useEffect(() => {
    let media: MediaQueryList
    try {
      media = window.matchMedia('(prefers-color-scheme: light)')
    } catch {
      return
    }
    const onChange = () => setSystem(media.matches ? 'light' : 'dark')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const theme = resolveTheme(pref, system)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // The first press commits to the opposite of what is on screen, so the
  // button always does the visible thing rather than revealing that the
  // preference was 'system'.
  const toggle = useCallback(() => {
    setPref((current) => {
      const next: Theme = resolveTheme(current, systemTheme()) === 'dark' ? 'light' : 'dark'
      saveThemePref(next)
      return next
    })
  }, [])

  const value = useMemo<ThemeState>(() => ({ theme, pref, toggle }), [theme, pref, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function SunIcon() {
  return (
    <svg
      width="16.5"
      height="16.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="16.5"
      height="16.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

/**
 * Shows where pressing it takes you, not where you are — a sun in the dark
 * theme means "switch to light". The icon, the label and the title all say
 * the same thing.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      data-testid="theme-toggle"
      data-theme-state={theme}
    >
      {next === 'light' ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
