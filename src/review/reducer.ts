import { DEFAULT_CLOSING, DEFAULT_OPENING, takesNote } from './grades'
import type { Grade, Grades, Review, TemplateId } from './types'

/**
 * The whole of grading state, in one reducer over one `grades` map keyed by
 * requirement id.
 *
 * The 2024 tool kept `graded`, `grade` and `showNotes` as local state inside
 * each Requirement component and keyed the lists by array index, so React
 * reused component instances across project switches and grades leaked from
 * one project into the next. There is nowhere for that to happen here: a
 * requirement id is the only handle, and no component owns any of it.
 *
 * The reducer is pure — no clock, no storage, no DOM. `updatedAt` is stamped
 * by the draft store on write.
 */

export type UndoFrame = {
  grades: Grades
  focusReqId: string | null
}

export type ReviewState = {
  review: Review
  /** Every requirement id in rubric order. Set once the project detail loads. */
  requirementIds: string[]
  /** Subset of requirementIds that are exceeds, i.e. optional. */
  exceedsIds: string[]
  undo: UndoFrame[]
}

export type ReviewAction =
  | { type: 'hydrate'; requirementIds: string[]; exceedsIds: string[] }
  | { type: 'grade'; reqId: string; grade: Grade }
  | { type: 'setNote'; reqId: string; note: string }
  | { type: 'focus'; reqId: string }
  | { type: 'move'; delta: number }
  | { type: 'advance' }
  | { type: 'markRemainingMet'; scope?: 'required' | 'exceeds' }
  | { type: 'setOpening'; value: string }
  | { type: 'setClosing'; value: string }
  | { type: 'setTemplate'; value: TemplateId }
  | { type: 'undo' }

const MAX_UNDO = 60

export function newReview(projectId: string, techdegreeId: string | null = null): Review {
  return {
    projectId,
    techdegreeId,
    grades: {},
    focusReqId: null,
    opening: DEFAULT_OPENING,
    closing: DEFAULT_CLOSING,
    template: 'slack',
  }
}

export function initReviewState(
  review: Review,
  requirementIds: string[] = [],
  exceedsIds: string[] = [],
): ReviewState {
  return { review, requirementIds, exceedsIds, undo: [] }
}

function pushUndo(state: ReviewState): UndoFrame[] {
  const frame: UndoFrame = {
    grades: state.review.grades,
    focusReqId: state.review.focusReqId,
  }
  const undo = [...state.undo, frame]
  return undo.length > MAX_UNDO ? undo.slice(undo.length - MAX_UNDO) : undo
}

/** The next requirement with no grade yet, else simply the next one down. */
function advanceFrom(ids: string[], focusReqId: string | null, grades: Grades): string | null {
  if (!ids.length) return null
  const i = ids.indexOf(focusReqId ?? '')
  const nextUnreviewed = ids.findIndex((id, idx) => idx > i && !grades[id])
  if (nextUnreviewed !== -1) return ids[nextUnreviewed] ?? null
  return ids[Math.min(ids.length - 1, i + 1)] ?? null
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  const { review, requirementIds: ids, exceedsIds } = state

  switch (action.type) {
    case 'hydrate': {
      const requirementIds = action.requirementIds
      const exceedsIds = action.exceedsIds
      const focusValid = review.focusReqId && requirementIds.includes(review.focusReqId)
      return {
        ...state,
        requirementIds,
        exceedsIds,
        review: focusValid
          ? review
          : { ...review, focusReqId: requirementIds[0] ?? null },
      }
    }

    case 'grade': {
      const { reqId, grade } = action
      const existing = review.grades[reqId]
      const undo = pushUndo(state)

      const grades: Grades = { ...review.grades }
      let resulting: Grade | undefined
      if (existing?.grade === grade) {
        // Pressing the same key again clears the grade.
        delete grades[reqId]
      } else {
        grades[reqId] = { grade, note: existing?.note ?? '' }
        resulting = grade
      }

      // Passing is meant to be free: met and not-attempted move you on.
      // Flagging is where the work is, so the focus stays put and the
      // caller drops the reviewer into the note.
      const focusReqId =
        resulting && !takesNote(resulting)
          ? advanceFrom(ids, review.focusReqId, grades)
          : review.focusReqId

      return { ...state, undo, review: { ...review, grades, focusReqId } }
    }

    case 'setNote': {
      const entry = review.grades[action.reqId]
      if (!entry) return state
      if (entry.note === action.note) return state
      return {
        ...state,
        review: {
          ...review,
          grades: { ...review.grades, [action.reqId]: { ...entry, note: action.note } },
        },
      }
    }

    case 'focus': {
      if (review.focusReqId === action.reqId) return state
      return { ...state, review: { ...review, focusReqId: action.reqId } }
    }

    case 'move': {
      if (!ids.length) return state
      const i = ids.indexOf(review.focusReqId ?? '')
      const from = i === -1 ? 0 : i
      const next = Math.min(ids.length - 1, Math.max(0, from + action.delta))
      const focusReqId = ids[next] ?? null
      if (focusReqId === review.focusReqId) return state
      return { ...state, review: { ...review, focusReqId } }
    }

    case 'advance': {
      const focusReqId = advanceFrom(ids, review.focusReqId, review.grades)
      if (focusReqId === review.focusReqId) return state
      return { ...state, review: { ...review, focusReqId } }
    }

    case 'markRemainingMet': {
      // Scoped, because sweeping unattempted exceeds into "passed" would tell
      // a student they met work they never submitted.
      const optional = new Set(exceedsIds)
      const wantExceeds = action.scope === 'exceeds'
      const remaining = ids.filter(
        (id) => !review.grades[id] && optional.has(id) === wantExceeds,
      )
      if (!remaining.length) return state
      const undo = pushUndo(state)
      const grades: Grades = { ...review.grades }
      for (const id of remaining) grades[id] = { grade: 'met', note: '' }
      return { ...state, undo, review: { ...review, grades } }
    }

    case 'setOpening':
      if (review.opening === action.value) return state
      return { ...state, review: { ...review, opening: action.value } }

    case 'setClosing':
      if (review.closing === action.value) return state
      return { ...state, review: { ...review, closing: action.value } }

    case 'setTemplate':
      // Slack is the only template in Milestone 1, so there is deliberately
      // no equality short-circuit here — it would narrow to `never`.
      return { ...state, review: { ...review, template: action.value } }

    case 'undo': {
      const frame = state.undo[state.undo.length - 1]
      if (!frame) return state
      return {
        ...state,
        undo: state.undo.slice(0, -1),
        review: { ...review, grades: frame.grades, focusReqId: frame.focusReqId },
      }
    }

    default:
      return state
  }
}
