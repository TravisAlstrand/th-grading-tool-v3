import type { Draft, Grades, Review, TemplateId } from './types'
import { DEFAULT_CLOSING, DEFAULT_OPENING } from './grades'

/**
 * Drafts, one per project, in localStorage.
 *
 * The 2024 tool persisted nothing but `darkMode`, so a stray ⌘R threw the
 * work away. Every write goes through here; nothing else touches storage.
 * Storage can throw (private mode, quota, a browser with site data blocked),
 * and a lost convenience must never take the review down with it — so every
 * call is guarded and failures are reported rather than raised.
 */

export const DRAFT_PREFIX = 'grading-tool:draft:'

/**
 * 'skipped' was a fourth grade until it was folded into needs-work. A draft
 * saved before that still carries it, and rejecting it here would fail
 * isGrades() and discard the entire review — so it is migrated in place.
 */
function migrate(grades: Grades): Grades {
  const out: Grades = {}
  for (const [reqId, entry] of Object.entries(grades)) {
    out[reqId] =
      (entry.grade as string) === 'skipped' ? { ...entry, grade: 'needs' } : entry
  }
  return out
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isGrades(value: unknown): value is Grades {
  if (!value || typeof value !== 'object') return false
  return Object.values(value as Record<string, unknown>).every(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      ['met', 'questioned', 'needs', 'skipped'].includes(
        (entry as { grade?: string }).grade as string,
      ) &&
      typeof (entry as { note?: unknown }).note === 'string',
  )
}

/** Anything that fails this is treated as absent rather than crashing a boot. */
export function parseDraft(value: unknown): Draft | null {
  if (!value || typeof value !== 'object') return null
  const d = value as Partial<Draft>
  if (typeof d.projectId !== 'string' || !d.projectId) return null
  if (!isGrades(d.grades)) return null
  return {
    projectId: d.projectId,
    techdegreeId: typeof d.techdegreeId === 'string' ? d.techdegreeId : null,
    grades: migrate(d.grades),
    focusReqId: typeof d.focusReqId === 'string' ? d.focusReqId : null,
    opening: typeof d.opening === 'string' ? d.opening : DEFAULT_OPENING,
    closing: typeof d.closing === 'string' ? d.closing : DEFAULT_CLOSING,
    template: (d.template as TemplateId) === 'slack' ? 'slack' : 'slack',
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
  }
}

export function loadDraft(projectId: string): Draft | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(DRAFT_PREFIX + projectId)
    return raw ? parseDraft(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function loadDrafts(): Draft[] {
  const store = storage()
  if (!store) return []
  const out: Draft[] = []
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      if (!key?.startsWith(DRAFT_PREFIX)) continue
      const raw = store.getItem(key)
      if (!raw) continue
      try {
        const draft = parseDraft(JSON.parse(raw))
        if (draft) out.push(draft)
      } catch {
        /* one unreadable draft must not hide the others */
      }
    }
  } catch {
    return out
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Returns the stamped draft on success and null if storage refused it, so
 * the UI can say "not saved" honestly instead of pretending.
 */
export function saveDraft(review: Review, now: number = Date.now()): Draft | null {
  const draft: Draft = { ...review, updatedAt: now }
  const store = storage()
  if (!store) return null
  try {
    store.setItem(DRAFT_PREFIX + review.projectId, JSON.stringify(draft))
    return draft
  } catch {
    return null
  }
}

export function deleteDraft(projectId: string): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(DRAFT_PREFIX + projectId)
  } catch {
    /* nothing to do — the draft is gone from the UI either way */
  }
}
