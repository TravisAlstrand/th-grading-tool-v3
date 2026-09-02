/**
 * Copy, and nothing else. The 2024 tool's only reset was a
 * `window.location.reload()` fired 2.5s after a copy, which is how reviews
 * were lost. Copying here has exactly one effect.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers and non-secure origins.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('style', 'position:fixed;top:-1000px;opacity:0')
      document.body.append(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
