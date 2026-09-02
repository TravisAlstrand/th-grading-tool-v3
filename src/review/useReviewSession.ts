import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ProjectDetail } from '@/sanity/types'
import { initReviewState, newReview, reviewReducer, type ReviewAction } from './reducer'
import { deleteDraft, loadDraft, saveDraft } from './storage'
import { requirementIds as idsOf, tally } from './selectors'
import type { Review, Tally } from './types'

export type ReviewSession = {
  review: Review
  requirementIds: string[]
  tally: Tally
  canUndo: boolean
  dispatch: React.Dispatch<ReviewAction>
  /** When the draft was last written. Null until something is worth saving. */
  savedAt: number | null
  /** True when localStorage refused the write — the UI says so rather than lying. */
  saveFailed: boolean
  /** Discards the draft. Used by the explicit, confirmed "close review". */
  discard: () => void
}

function hasContent(review: Review, baseline: Review): boolean {
  return (
    Object.keys(review.grades).length > 0 ||
    review.opening !== baseline.opening ||
    review.closing !== baseline.closing ||
    review.template !== baseline.template
  )
}

/**
 * Owns one review: its reducer, and the autosave that makes losing work
 * impossible. Resuming is just "the draft was already there at init".
 */
export function useReviewSession(
  projectId: string,
  project: ProjectDetail | null | undefined,
): ReviewSession {
  const [state, dispatch] = useReducer(
    reviewReducer,
    projectId,
    (id) => {
      const draft = loadDraft(id)
      return initReviewState(draft ?? newReview(id))
    },
  )

  const baselineRef = useRef<Review>(newReview(projectId))
  // A draft that already existed is dirty from the first render, so focus
  // moves and template switches keep being persisted from the start.
  const dirtyRef = useRef<boolean>(loadDraft(projectId) !== null)
  const [savedAt, setSavedAt] = useState<number | null>(() => loadDraft(projectId)?.updatedAt ?? null)
  const [saveFailed, setSaveFailed] = useState(false)

  const requirementIds = useMemo(() => idsOf(project), [project])

  useEffect(() => {
    if (!requirementIds.length) return
    dispatch({ type: 'hydrate', requirementIds })
  }, [requirementIds])

  const { review } = state

  useEffect(() => {
    if (!dirtyRef.current) {
      if (!hasContent(review, baselineRef.current)) return
      dirtyRef.current = true
    }
    const saved = saveDraft(review)
    setSaveFailed(saved === null)
    if (saved) setSavedAt(saved.updatedAt)
  }, [review])

  const discard = useCallback(() => {
    deleteDraft(projectId)
    dirtyRef.current = false
    setSavedAt(null)
  }, [projectId])

  const counts = useMemo(() => tally(requirementIds, review.grades), [requirementIds, review.grades])

  return {
    review,
    requirementIds,
    tally: counts,
    canUndo: state.undo.length > 0,
    dispatch,
    savedAt,
    saveFailed,
    discard,
  }
}
