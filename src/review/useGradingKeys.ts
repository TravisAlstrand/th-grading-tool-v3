import { useEffect, useRef } from 'react'
import { KEY_TO_GRADE } from './grades'
import type { Grade } from './types'

/**
 * Two rules the 2024 tool broke, held here in one place:
 *
 *  1. Every shortcut this app claims calls `preventDefault`. v1 bound ⌘R to
 *     the review sidebar without it, so the browser reloaded and took the
 *     review with it.
 *  2. Single-key shortcuts are suspended whenever a text field has focus, so
 *     typing "1 2 3" into a note types "1 2 3". v1 hijacked Ctrl+C globally,
 *     which broke copy while writing feedback.
 *
 * The two chords that do work while typing — ⌘↵ to save and advance, and Esc
 * to leave the field — are the ones a reviewer needs mid-sentence.
 */

export type GradingKeyHandlers = {
  onMove: (delta: number) => void
  onGrade: (grade: Grade) => void
  onMarkRemaining: () => void
  onEditNote: () => void
  onUndo: () => void
  onAdvance: () => void
  onSend: () => void
  onBack: () => void
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'INPUT' ||
    target.isContentEditable
  )
}

export function useGradingKeys(enabled: boolean, handlers: GradingKeyHandlers): void {
  const ref = useRef(handlers)
  ref.current = handlers
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabledRef.current) return
      const h = ref.current
      const mod = e.metaKey || e.ctrlKey
      const typing = isTypingTarget(e.target)

      // --- chords, which work even inside a note ---
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        if (typing) {
          if (e.target instanceof HTMLElement) e.target.blur()
          h.onAdvance()
        } else {
          h.onSend()
        }
        return
      }

      if (mod && e.key.toLowerCase() === 'z') {
        // Inside a note, ⌘Z belongs to the text field.
        if (typing) return
        e.preventDefault()
        h.onUndo()
        return
      }

      // --- inside a note, nothing else is a shortcut ---
      if (typing) {
        if (e.key === 'Escape') {
          e.preventDefault()
          if (e.target instanceof HTMLElement) e.target.blur()
        }
        return
      }

      if (mod || e.altKey) return

      if (e.key === 'Escape') {
        e.preventDefault()
        h.onBack()
        return
      }
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault()
        h.onMove(1)
        return
      }
      if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault()
        h.onMove(-1)
        return
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        h.onMarkRemaining()
        return
      }
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        h.onEditNote()
        return
      }
      const grade = KEY_TO_GRADE[e.key]
      if (grade) {
        e.preventDefault()
        h.onGrade(grade)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
