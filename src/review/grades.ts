import type { Grade } from './types'

export const GRADES: Record<Grade, { label: string; key: string; word: string }> = {
  met: { label: 'Met', key: '1', word: 'met' },
  questioned: { label: 'Questionable', key: '2', word: 'questioned' },
  needs: { label: 'Needs work', key: '3', word: 'needs work' },
  skipped: { label: 'Not attempted', key: '0', word: 'not attempted' },
}

/** Output order, and the order the grade buttons appear in. */
export const GRADE_ORDER: Grade[] = ['met', 'questioned', 'needs', 'skipped']

export const KEY_TO_GRADE: Record<string, Grade> = {
  '1': 'met',
  '2': 'questioned',
  '3': 'needs',
  '0': 'skipped',
}

/** The two grades that carry written feedback. */
export function takesNote(grade: Grade | undefined): boolean {
  return grade === 'questioned' || grade === 'needs'
}

export const DEFAULT_OPENING = "Here's the full breakdown of your project review."
export const DEFAULT_CLOSING = 'Shout in #community if anything here is unclear.'
