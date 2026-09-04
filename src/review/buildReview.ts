import type { ProjectDetail, Requirement } from '@/sanity/types'
import { GRADE_ORDER, takesNote } from './grades'
import { flatRequirements } from './selectors'
import { getTemplate, type Template } from './templates'
import type { Grade, Review } from './types'

/**
 * Review in, text out. No DOM, no React, no reads of anything but its
 * arguments.
 *
 * This is the one function where a silent regression corrupts every review
 * that goes out to a student, so it is pure and it is unit tested. Keep it
 * that way: if it ever needs a hook, a ref or `document`, the thing it needs
 * belongs somewhere else.
 */

export type ReviewItem = {
  req: Requirement
  note: string
}

export type ReviewGroups = Record<Grade, ReviewItem[]>

export type BuiltReview = {
  text: string
  groups: ReviewGroups
}

export function buildReview(review: Review, project: ProjectDetail | null | undefined): BuiltReview {
  const template: Template = getTemplate(review.template)

  const groups: ReviewGroups = { met: [], questioned: [], needs: [] }

  for (const { req } of flatRequirements(project)) {
    const entry = review.grades[req._id]
    if (!entry?.grade) continue
    // A note written under questionable/needs-work is kept in the draft when
    // the grade changes, so it survives a mis-click — but it is not part of
    // the review under a grade that carries no feedback.
    const note = takesNote(entry.grade) ? (entry.note ?? '').trim() : ''
    groups[entry.grade].push({ req, note })
  }

  // Within a group, plain requirements come before exceeds ones — a student
  // reads what the project asked for before what it did not.
  for (const grade of GRADE_ORDER) {
    groups[grade].sort((a, b) => Number(a.req.isExceeds) - Number(b.req.isExceeds))
  }

  const blocks: string[] = []

  const opening = review.opening.trim()
  if (opening) blocks.push(opening)

  let wroteRequirements = false

  for (const grade of GRADE_ORDER) {
    const items = groups[grade]
    if (!items.length) continue
    wroteRequirements = true

    const lines: string[] = []
    for (const { req, note } of items) {
      const exceeds = req.isExceeds ? template.exceeds : ''
      lines.push(`${template.mark[grade]}${template.gap}${exceeds}${req.title}`)
      if (note) lines.push(template.quote(note), '')
    }
    blocks.push(lines.join('\n').replace(/\n+$/, ''))
  }

  const closing = review.closing.trim()
  if (closing) {
    // Only between the two: a review with no graded requirements would
    // otherwise open with a rule under the greeting.
    if (wroteRequirements && template.divider) blocks.push(template.divider)
    blocks.push(closing)
  }

  return { text: blocks.join('\n\n') + '\n', groups }
}
