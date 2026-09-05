import { describe, expect, it } from 'vitest'
import { initReviewState, reviewReducer } from './reducer'
import { exceedsIds, requirementIds, reviewStatus, tally } from './selectors'
import { GAME_SHOW, reviewFor } from '@/test/helpers'

/**
 * Exceeds requirements are optional. Two things follow, and both used to be
 * wrong: an ungraded exceeds must not make a finished review look unfinished,
 * and "mark remaining" must not credit a student with work they never did.
 */

const ids = requirementIds(GAME_SHOW)
const exceeds = exceedsIds(GAME_SHOW)
const required = ids.filter((id) => !exceeds.includes(id))

const hydrated = () =>
  reviewReducer(initReviewState(reviewFor(GAME_SHOW)), {
    type: 'hydrate',
    requirementIds: ids,
    exceedsIds: exceeds,
  })

const gradeAll = (state: ReturnType<typeof hydrated>, targets: string[]) =>
  targets.reduce(
    (acc, reqId) => reviewReducer(acc, { type: 'grade', reqId, grade: 'met' }),
    state,
  )

describe('the fixture', () => {
  it('has both kinds of requirement, or these tests prove nothing', () => {
    expect(exceeds.length).toBeGreaterThan(0)
    expect(required.length).toBeGreaterThan(0)
  })
})

describe('tally', () => {
  it('counts only the required ones toward completeness', () => {
    const t = tally(ids, {}, exceeds)
    expect(t.total).toBe(required.length)
    expect(t.unreviewed).toBe(required.length)
    expect(t.exceedsUngraded).toBe(exceeds.length)
  })

  it('reports nothing unreviewed once the required ones are graded', () => {
    const state = gradeAll(hydrated(), required)
    const t = tally(ids, state.review.grades, exceeds)
    expect(t.unreviewed).toBe(0)
    expect(t.reviewed).toBe(t.total)
    // Still visible, just not blocking.
    expect(t.exceedsUngraded).toBe(exceeds.length)
  })

  it('counts a graded exceeds under its grade without inflating the total', () => {
    const state = gradeAll(hydrated(), [exceeds[0]!])
    const t = tally(ids, state.review.grades, exceeds)
    expect(t.met).toBe(1)
    expect(t.total).toBe(required.length)
    expect(t.exceedsUngraded).toBe(exceeds.length - 1)
  })
})

describe('mark remaining', () => {
  it('leaves ungraded exceeds alone, so unattempted work is never credited', () => {
    const state = reviewReducer(hydrated(), { type: 'markRemainingMet', scope: 'required' })
    for (const id of required) expect(state.review.grades[id]?.grade).toBe('met')
    for (const id of exceeds) expect(state.review.grades[id]).toBeUndefined()
  })

  it('marks the exceeds only when asked for them by name', () => {
    const state = reviewReducer(hydrated(), { type: 'markRemainingMet', scope: 'exceeds' })
    for (const id of exceeds) expect(state.review.grades[id]?.grade).toBe('met')
    for (const id of required) expect(state.review.grades[id]).toBeUndefined()
  })

  it('never overwrites a grade that is already there', () => {
    const graded = reviewReducer(hydrated(), {
      type: 'grade',
      reqId: exceeds[0]!,
      grade: 'needs',
    })
    const state = reviewReducer(graded, { type: 'markRemainingMet', scope: 'exceeds' })
    expect(state.review.grades[exceeds[0]!]?.grade).toBe('needs')
  })

  it('is undoable in one step', () => {
    const state = reviewReducer(hydrated(), { type: 'markRemainingMet', scope: 'exceeds' })
    const undone = reviewReducer(state, { type: 'undo' })
    for (const id of exceeds) expect(undone.review.grades[id]).toBeUndefined()
  })
})

/**
 * The send screen reported one number, which could only ever describe the
 * required half — a review with every requirement graded and three exceeds
 * untouched read as "nothing unreviewed". Both halves are stated now.
 */
describe('reviewStatus', () => {
  const statusFor = (graded: string[]) =>
    reviewStatus(tally(ids, gradeAll(hydrated(), graded).review.grades, exceeds))

  it('says nothing is left only when nothing is, exceeds included', () => {
    const done = statusFor(ids)
    expect(done.allClear).toBe(true)
    expect(done.meets).toBe('nothing unreviewed')
    expect(done.exceeds).toBeNull()
  })

  it('does not call a review clear while exceeds are outstanding', () => {
    // This is the case the single number got wrong.
    const status = statusFor(required)
    expect(status.allClear).toBe(false)
    expect(status.meets).toBe('all meets reviewed')
    expect(status.exceeds).toBe(`${exceeds.length} exceeds unreviewed`)
  })

  it('states both halves when both have work left', () => {
    const status = statusFor(required.slice(0, -1))
    expect(status.meets).toBe('1 meets unreviewed')
    expect(status.exceeds).toBe(`${exceeds.length} exceeds unreviewed`)
  })

  it('credits the exceeds half on its own', () => {
    const status = statusFor([...exceeds, ...required.slice(0, -2)])
    expect(status.meets).toBe('2 meets unreviewed')
    expect(status.exceeds).toBe('all exceeds reviewed')
  })

  it('says nothing about exceeds for a project that has none', () => {
    // "all exceeds reviewed" about an empty set is a claim about nothing.
    const noneOptional = tally(required, {}, [])
    expect(noneOptional.exceedsTotal).toBe(0)
    expect(reviewStatus(noneOptional).exceeds).toBeNull()
    expect(reviewStatus(noneOptional).meets).toBe(`${required.length} meets unreviewed`)
  })

  it('counts exceedsTotal from this project, not from the ids handed in', () => {
    const t = tally(ids, {}, [...exceeds, 'an-exceeds-from-another-project'])
    expect(t.exceedsTotal).toBe(exceeds.length)
  })
})
