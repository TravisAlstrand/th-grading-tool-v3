import { describe, expect, it } from 'vitest'
import { formatChord, isMacPlatform } from './platform'

/**
 * The labels are the only thing that varies — every handler accepts
 * `metaKey || ctrlKey` — so these lock the spelling for both platforms
 * without needing one of each machine.
 */

describe('isMacPlatform', () => {
  it('recognises the values the two platform APIs report', () => {
    expect(isMacPlatform('macOS', '')).toBe(true) // navigator.userAgentData
    expect(isMacPlatform('MacIntel', '')).toBe(true) // navigator.platform
    expect(isMacPlatform('Windows', '')).toBe(false)
    expect(isMacPlatform('Win32', '')).toBe(false)
    expect(isMacPlatform('Linux x86_64', '')).toBe(false)
  })

  it('falls back to the user agent when no platform is reported', () => {
    expect(isMacPlatform(undefined, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true)
    expect(isMacPlatform('', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(isMacPlatform(undefined, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
    expect(isMacPlatform('', 'Mozilla/5.0 (X11; Linux x86_64)')).toBe(false)
  })

  it('treats an unknown platform as not-Mac, so the label spells the key out', () => {
    expect(isMacPlatform(undefined, '')).toBe(false)
  })
})

describe('formatChord', () => {
  it('writes the Mac form with no separator', () => {
    expect(formatChord('K', true)).toBe('⌘K')
    expect(formatChord('Z', true)).toBe('⌘Z')
  })

  it('writes the Windows form with Ctrl and a plus', () => {
    expect(formatChord('K', false)).toBe('Ctrl+K')
    expect(formatChord('Z', false)).toBe('Ctrl+Z')
  })

  it('keeps ↵ on a Mac and spells Enter out everywhere else', () => {
    expect(formatChord('↵', true)).toBe('⌘↵')
    expect(formatChord('↵', false)).toBe('Ctrl+Enter')
  })

  it('never emits ⌃, which is a Mac glyph rather than a Windows one', () => {
    expect(formatChord('K', false)).not.toContain('⌃')
    expect(formatChord('K', false)).not.toContain('⌘')
  })
})
