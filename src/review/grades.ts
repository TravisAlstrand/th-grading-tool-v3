import type { Grade } from './types'

export const GRADES: Record<Grade, { label: string; key: string; word: string }> = {
  met: { label: 'Passed', key: '1', word: 'passed' },
  questioned: { label: 'Questionable', key: '2', word: 'questioned' },
  needs: { label: 'Needs work', key: '3', word: 'needs work' },
}

/** Output order, and the order the grade buttons appear in. */
export const GRADE_ORDER: Grade[] = ['met', 'questioned', 'needs']

export const KEY_TO_GRADE: Record<string, Grade> = {
  '1': 'met',
  '2': 'questioned',
  '3': 'needs',
}

/** The two grades that carry written feedback. */
export function takesNote(grade: Grade | undefined): boolean {
  return grade === 'questioned' || grade === 'needs'
}

export const DEFAULT_OPENING = "Here's the full breakdown of your project review."
export const DEFAULT_CLOSING =
  "If anything above is unclear or you'd like more help, please let me know!"
