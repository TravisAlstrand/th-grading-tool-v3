import { describe, expect, it } from 'vitest'
import { buildReview } from './buildReview'
import { DEFAULT_CLOSING, DEFAULT_OPENING } from './grades'
import { flatRequirements } from './selectors'
import { GAME_SHOW, PUBLIC_API, gradesFrom, idsOf, reviewFor } from '@/test/helpers'

/**
 * buildReview() is the one place where a silent regression corrupts every
 * review that goes out to a student, so these assert the actual text, not
 * "it returned a string".
 */

const ids = idsOf(GAME_SHOW)
const id = (n: number) => {
  const value = ids[n]
  if (!value) throw new Error(`No requirement at index ${n}`)
  return value
}
const titleOf = (reqId: string) =>
  flatRequirements(GAME_SHOW).find((f) => f.req._id === reqId)!.req.title

describe('buildReview', () => {
  it('opens and closes with the review lines and nothing between when nothing is graded', () => {
    const { text } = buildReview(reviewFor(GAME_SHOW), GAME_SHOW)
    expect(text).toBe(`${DEFAULT_OPENING}\n\n${DEFAULT_CLOSING}\n`)
  })

  it('marks each grade with its Slack emoji and keeps rubric order within a group', () => {
    const review = reviewFor(
      GAME_SHOW,
      gradesFrom([
        [id(0), 'met'],
        [id(1), 'met'],
        [id(2), 'met'],
      ]),
    )
    const { text } = buildReview(review, GAME_SHOW)
    expect(text).toContain(`:meets:${titleOf(id(0))}`)
    expect(text.indexOf(titleOf(id(0)))).toBeLessThan(text.indexOf(titleOf(id(1))))
    expect(text.indexOf(titleOf(id(1)))).toBeLessThan(text.indexOf(titleOf(id(2))))
  })

  it('groups by grade in passed, questioned, needs-work order', () => {
    const review = reviewFor(
      GAME_SHOW,
      gradesFrom([
        [id(0), 'needs', 'Only three phrases.'],
        [id(1), 'met'],
        [id(2), 'questioned', 'Some phrases have digits.'],
      ]),
    )
    const { text } = buildReview(review, GAME_SHOW)
    expect(text.indexOf(':meets:')).toBeLessThan(text.indexOf(':questioned:'))
    expect(text.indexOf(':questioned:')).toBeLessThan(text.indexOf(':needs-work:'))
  })

  it('quotes a note under its requirement, one "> " per line', () => {
    const review = reviewFor(
      GAME_SHOW,
      gradesFrom([[id(1), 'needs', 'Only three phrases.\nAdd two more.']]),
    )
    const { text } = buildReview(review, GAME_SHOW)
    expect(text).toContain(
      `:needs-work:${titleOf(id(1))}\n> Only three phrases.\n> Add two more.`,
    )
  })

  it('leaves a fenced code block out of the quote and quotes the prose around it', () => {
    // A "> " inside a Slack code block prints as a literal ">" on every line.
    const note = [
      'Two of these are still var:',
      '```js',
      'var total = items.length',
      '```',
      'Same in the loop below.',
    ].join('\n')
    const review = reviewFor(GAME_SHOW, gradesFrom([[id(1), 'needs', note]]))
    const { text } = buildReview(review, GAME_SHOW)
    expect(text).toContain(
      [
        `:needs-work:${titleOf(id(1))}`,
        '> Two of these are still var:',
        '```js',
        'var total = items.length',
        '```',
        '> Same in the loop below.',
      ].join('\n'),
    )
  })

  it('leaves a note out of the review when the grade carries no feedback', () => {
    // Written under needs-work, then the grade switched to passing. The text
    // stays in the draft, but it is not part of what the student reads.
    const review = reviewFor(
      GAME_SHOW,
      gradesFrom([[id(1), 'met', 'Only three phrases. Add two more.']]),
    )
    const { text, groups } = buildReview(review, GAME_SHOW)
    expect(text).not.toContain('Only three phrases')
    expect(text).not.toContain('>')
    expect(text).toContain(`:meets:${titleOf(id(1))}`)
    // groups feed the send screen, so they must not disagree with the text.
    expect(groups.met[0]?.note).toBe('')
  })

  it('uses the note again as soon as the grade takes one back', () => {
    const kept = 'Only three phrases. Add two more.'
    const passing = reviewFor(GAME_SHOW, gradesFrom([[id(1), 'met', kept]]))
    const flagged = reviewFor(GAME_SHOW, gradesFrom([[id(1), 'needs', kept]]))
    expect(buildReview(passing, GAME_SHOW).text).not.toContain(kept)
    expect(buildReview(flagged, GAME_SHOW).text).toContain(`> ${kept}`)
  })

  it('trims whitespace-only notes rather than emitting an empty quote', () => {
    const review = reviewFor(GAME_SHOW, gradesFrom([[id(1), 'needs', '   \n  ']]))
    const { text } = buildReview(review, GAME_SHOW)
    expect(text).not.toContain('>')
    expect(text).toContain(`:needs-work:${titleOf(id(1))}`)
  })

  it('prefixes exceeds requirements and sorts them after plain ones in their group', () => {
    // Index 6 is "Transitions have been added to the phrase display" (exceeds).
    const exceedsId = id(6)
    const plainId = id(4)
    expect(flatRequirements(GAME_SHOW)[6]!.req.isExceeds).toBe(true)

    const review = reviewFor(
      GAME_SHOW,
      gradesFrom([
        [exceedsId, 'met'],
        [plainId, 'met'],
      ]),
    )
    const { text } = buildReview(review, GAME_SHOW)
    expect(text).toContain(`:meets::exceeds: ${titleOf(exceedsId)}`)
    expect(text.indexOf(titleOf(plainId))).toBeLessThan(text.indexOf(titleOf(exceedsId)))
  })

  it('omits an empty opening or closing line without leaving blank blocks', () => {
    const review = { ...reviewFor(GAME_SHOW, gradesFrom([[id(0), 'met']])), opening: '', closing: '' }
    const { text } = buildReview(review, GAME_SHOW)
    expect(text).toBe(`:meets:${titleOf(id(0))}\n`)
  })

  it('ignores grades for requirements that are not in this project', () => {
    const review = reviewFor(
      GAME_SHOW,
      gradesFrom([
        [id(0), 'met'],
        ['a-requirement-from-another-project', 'needs', 'should not appear'],
      ]),
    )
    const { text, groups } = buildReview(review, GAME_SHOW)
    expect(text).not.toContain('should not appear')
    expect(groups.needs).toHaveLength(0)
    expect(groups.met).toHaveLength(1)
  })

  it('returns groups that match the text, for the send screen to render', () => {
    const review = reviewFor(
      PUBLIC_API,
      gradesFrom([
        [idsOf(PUBLIC_API)[0]!, 'met'],
        [idsOf(PUBLIC_API)[3]!, 'questioned', 'Search only matches first names.'],
      ]),
    )
    const { groups } = buildReview(review, PUBLIC_API)
    expect(groups.met.map((i) => i.req._id)).toEqual([idsOf(PUBLIC_API)[0]])
    expect(groups.questioned[0]?.note).toBe('Search only matches first names.')
    expect(groups.needs).toEqual([])
  })

  it('always ends with exactly one trailing newline', () => {
    const review = reviewFor(GAME_SHOW, gradesFrom([[id(0), 'needs', 'note here']]))
    const { text } = buildReview(review, GAME_SHOW)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  it('is pure — the same review builds the same text twice and mutates nothing', () => {
    const grades = gradesFrom([
      [id(0), 'met'],
      [id(6), 'met'],
    ])
    const review = reviewFor(GAME_SHOW, grades)
    const snapshot = JSON.stringify({ review, project: GAME_SHOW })
    const first = buildReview(review, GAME_SHOW).text
    const second = buildReview(review, GAME_SHOW).text
    expect(first).toBe(second)
    expect(JSON.stringify({ review, project: GAME_SHOW })).toBe(snapshot)
  })

  it('survives a project with no sections', () => {
    const empty = { ...GAME_SHOW, gradingSections: [] }
    const { text } = buildReview(reviewFor(empty), empty)
    expect(text).toBe(`${DEFAULT_OPENING}\n\n${DEFAULT_CLOSING}\n`)
  })
})
