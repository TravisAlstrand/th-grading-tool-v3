/**
 * Roving focus over a list marked up with `data-nav-item`.
 *
 * Focus *is* the selection on the launcher and in the resources panel —
 * there is no separate "which row is active" state to keep in sync, and
 * Enter is then just the browser activating whatever is focused. Both
 * screens move through their lists the same way, so the movement lives here
 * rather than being written twice and drifting.
 *
 * `offsetParent` is the visibility test: the launcher renders its techdegree
 * picker twice and hides one copy by breakpoint, so "the items" always means
 * the ones actually on screen.
 */
export function visibleNavItems(selector: string, scope: ParentNode = document): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => el.offsetParent !== null,
  )
}

/**
 * Moves focus `delta` places. Clamps at the ends by default, which is what
 * J/K do everywhere in this app; `wrap` is for Tab inside a modal, where
 * running off the end should come back round rather than escape the dialog.
 */
export function moveFocusBy(items: HTMLElement[], delta: number, wrap = false): void {
  if (!items.length) return
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at === -1) {
    items[0]?.focus()
    return
  }
  const next = wrap
    ? (at + delta + items.length) % items.length
    : Math.max(0, Math.min(items.length - 1, at + delta))
  items[next]?.focus()
}
