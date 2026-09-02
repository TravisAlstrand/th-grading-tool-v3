/**
 * How a keyboard shortcut is spelled for the reviewer reading it.
 *
 * The handlers themselves accept either modifier — every one of them tests
 * `e.metaKey || e.ctrlKey` — so this is purely about the label. A Windows
 * reviewer pressing Ctrl+K was always going to work; they were just being
 * told to press a key their keyboard does not have.
 *
 * Mac writes `⌘K`, no separator, and `↵` for Enter. Windows and Linux write
 * `Ctrl+K` with a plus and spell Enter out — that is Microsoft's own house
 * style, and `⌃` is Mac's Control glyph rather than a Windows one.
 */

type NavigatorUAData = { platform?: string }

/** Pure, so both branches are testable without a Mac and a PC to hand. */
export function isMacPlatform(platform: string | undefined, userAgent: string): boolean {
  if (platform) return /mac/i.test(platform)
  return /Mac|iPhone|iPad|iPod/i.test(userAgent)
}

/** `⌘K` on a Mac, `Ctrl+K` everywhere else. */
export function formatChord(key: string, mac: boolean): string {
  const modifier = mac ? '⌘' : 'Ctrl'
  const named = mac ? key : key === '↵' ? 'Enter' : key
  return mac ? `${modifier}${named}` : `${modifier}+${named}`
}

function detect(): boolean {
  try {
    const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData
    return isMacPlatform(uaData?.platform || navigator.platform, navigator.userAgent)
  } catch {
    return false
  }
}

/** Resolved once — the platform does not change mid-session. */
export const IS_MAC = detect()

/** The Enter key as this platform writes it. */
export const ENTER = IS_MAC ? '↵' : 'Enter'

export function chord(key: string): string {
  return formatChord(key, IS_MAC)
}
