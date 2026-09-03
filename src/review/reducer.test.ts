import { describe, expect, it } from 'vitest'
import { initReviewState, newReview, reviewReducer, type ReviewState } from './reducer'
import { tally } from './selectors'
import { GAME_SHOW, idsOf } from '@/test/helpers'

const ids = idsOf(GAME_SHOW)
const id = (n: number) => {
  const value = ids[n]
  if (!value) throw new Error(`No requirement at index ${n}`)
  return value
}

function start(): ReviewState {
  return reviewReducer(
    initReviewState(newReview(GAME_SHOW._id, GAME_SHOW.techdegree?._id ?? null)),
    { type: 'hydrate', exceedsIds: [], requirementIds: ids },
  )
}

describe('reviewReducer', () => {
  it('focuses the first requirement on hydrate', () => {
    expect(start().review.focusReqId).toBe(id(0))
  })

  it('keeps a resumed draft focused where it was left', () => {
    const resumed = initReviewState({
      ...newReview(GAME_SHOW._id),
      focusReqId: id(5),
    })
    const state = reviewReducer(resumed, { type: 'hydrate', exceedsIds: [], requirementIds: ids })
    expect(state.review.focusReqId).toBe(id(5))
  })

  it('falls back to the first requirement when a resumed focus is not in this project', () => {
    const resumed = initReviewState({
      ...newReview(GAME_SHOW._id),
      focusReqId: 'an-id-from-some-other-project',
    })
    const state = reviewReducer(resumed, { type: 'hydrate', exceedsIds: [], requirementIds: ids })
    expect(state.review.focusReqId).toBe(id(0))
  })

  describe('grading', () => {
    it('records a grade against the requirement id', () => {
      const state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'met' })
      expect(state.review.grades[id(0)]).toEqual({ grade: 'met', note: '' })
    })

    it('advances to the next unreviewed requirement after met', () => {
      const state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'met' })
      expect(state.review.focusReqId).toBe(id(1))
    })

    it('advances after a passing grade — passing is meant to be free', () => {
      const state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'met' })
      expect(state.review.focusReqId).toBe(id(1))
    })

    it('skips over requirements already graded when advancing', () => {
      let state = start()
      state = reviewReducer(state, { type: 'grade', reqId: id(1), grade: 'met' })
      state = reviewReducer(state, { type: 'focus', reqId: id(0) })
      state = reviewReducer(state, { type: 'grade', reqId: id(0), grade: 'met' })
      expect(state.review.focusReqId).toBe(id(2))
    })

    it('holds focus on questionable and needs-work, so the note opens where you are', () => {
      const questioned = reviewReducer(start(), {
        type: 'grade',
        reqId: id(0),
        grade: 'questioned',
      })
      expect(questioned.review.focusReqId).toBe(id(0))

      const needs = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'needs' })
      expect(needs.review.focusReqId).toBe(id(0))
    })

    it('clears the grade when the same grade is applied twice, without advancing', () => {
      let state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'met' })
      state = reviewReducer(state, { type: 'focus', reqId: id(0) })
      state = reviewReducer(state, { type: 'grade', reqId: id(0), grade: 'met' })
      expect(state.review.grades[id(0)]).toBeUndefined()
      expect(state.review.focusReqId).toBe(id(0))
    })

    it('changes the grade, keeping the note, when a different grade is applied', () => {
      let state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'needs' })
      state = reviewReducer(state, { type: 'setNote', reqId: id(0), note: 'Only three phrases.' })
      state = reviewReducer(state, { type: 'grade', reqId: id(0), grade: 'questioned' })
      expect(state.review.grades[id(0)]).toEqual({
        grade: 'questioned',
        note: 'Only three phrases.',
      })
    })

    it('stays on the last requirement when everything after it is graded', () => {
      let state = start()
      for (const reqId of ids) state = reviewReducer(state, { type: 'grade', reqId, grade: 'met' })
      expect(state.review.focusReqId).toBe(ids[ids.length - 1])
    })

    it('never mutates the previous grades object', () => {
      const before = start()
      const beforeGrades = before.review.grades
      const after = reviewReducer(before, { type: 'grade', reqId: id(0), grade: 'met' })
      expect(beforeGrades).toEqual({})
      expect(after.review.grades).not.toBe(beforeGrades)
    })
  })

  describe('mark remaining as met', () => {
    it('fills every ungraded requirement and leaves graded ones alone', () => {
      let state = reviewReducer(start(), { type: 'grade', reqId: id(2), grade: 'needs' })
      state = reviewReducer(state, { type: 'setNote', reqId: id(2), note: 'Digits in phrases.' })
      state = reviewReducer(state, { type: 'markRemainingMet' })

      const counts = tally(ids, state.review.grades)
      expect(counts.unreviewed).toBe(0)
      expect(counts.needs).toBe(1)
      expect(counts.met).toBe(ids.length - 1)
      expect(state.review.grades[id(2)]).toEqual({ grade: 'needs', note: 'Digits in phrases.' })
    })

    it('does nothing, and adds no undo frame, when nothing is unreviewed', () => {
      let state = start()
      state = reviewReducer(state, { type: 'markRemainingMet' })
      const undoDepth = state.undo.length
      const again = reviewReducer(state, { type: 'markRemainingMet' })
      expect(again).toBe(state)
      expect(again.undo.length).toBe(undoDepth)
    })

    it('does not move the focus', () => {
      const state = reviewReducer(start(), { type: 'markRemainingMet' })
      expect(state.review.focusReqId).toBe(id(0))
    })
  })

  describe('undo', () => {
    it('restores the grades and the focus from before the last grade', () => {
      let state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'met' })
      state = reviewReducer(state, { type: 'undo' })
      expect(state.review.grades).toEqual({})
      expect(state.review.focusReqId).toBe(id(0))
    })

    it('undoes a mark-remaining in one step', () => {
      let state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'needs' })
      state = reviewReducer(state, { type: 'markRemainingMet' })
      expect(tally(ids, state.review.grades).unreviewed).toBe(0)
      state = reviewReducer(state, { type: 'undo' })
      expect(tally(ids, state.review.grades).unreviewed).toBe(ids.length - 1)
      expect(state.review.grades[id(0)]?.grade).toBe('needs')
    })

    it('is a no-op with an empty stack', () => {
      const state = start()
      expect(reviewReducer(state, { type: 'undo' })).toBe(state)
    })

    it('does not treat typing a note as an undo step', () => {
      let state = reviewReducer(start(), { type: 'grade', reqId: id(0), grade: 'needs' })
      state = reviewReducer(state, { type: 'setNote', reqId: id(0), note: 'a' })
      state = reviewReducer(state, { type: 'setNote', reqId: id(0), note: 'ab' })
      state = reviewReducer(state, { type: 'undo' })
      expect(state.review.grades).toEqual({})
    })
  })

  describe('navigation', () => {
    it('moves down and up, and stops at both ends', () => {
      let state = reviewReducer(start(), { type: 'move', delta: -1 })
      expect(state.review.focusReqId).toBe(id(0))

      state = reviewReducer(state, { type: 'move', delta: 1 })
      expect(state.review.focusReqId).toBe(id(1))

      state = reviewReducer(state, { type: 'move', delta: 999 })
      expect(state.review.focusReqId).toBe(ids[ids.length - 1])
    })
  })

  describe('notes', () => {
    it('ignores a note for a requirement with no grade', () => {
      const state = start()
      expect(reviewReducer(state, { type: 'setNote', reqId: id(0), note: 'x' })).toBe(state)
    })
  })

  describe('the message lines', () => {
    it('holds the opening and closing lines on the review', () => {
      let state = reviewReducer(start(), { type: 'setOpening', value: 'Nice work overall.' })
      state = reviewReducer(state, { type: 'setClosing', value: 'Resubmit when ready.' })
      expect(state.review.opening).toBe('Nice work overall.')
      expect(state.review.closing).toBe('Resubmit when ready.')
    })
  })
})
