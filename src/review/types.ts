export type Grade = 'met' | 'questioned' | 'needs'

export type GradeEntry = {
  grade: Grade
  note: string
}

/** One map keyed by requirement id. The single source of truth for a review. */
export type Grades = Record<string, GradeEntry>

export type TemplateId = 'slack'

export type Review = {
  projectId: string
  techdegreeId: string | null
  grades: Grades
  focusReqId: string | null
  opening: string
  closing: string
  /**
   * Whether the rule between the requirements and the closing line is drawn.
   * On by default; a review with no closing line has nothing to separate,
   * and a rule trailing the last requirement reads as a mistake.
   */
  divider: boolean
  template: TemplateId
}

/**
 * What actually goes into localStorage. `updatedAt` is stamped by the store
 * on write, which is what keeps the reducer pure — it never reads the clock.
 */
export type Draft = Review & { updatedAt: number }

/**
 * `total`, `reviewed` and `unreviewed` cover the REQUIRED requirements only.
 * Exceeds are optional, so leaving one ungraded must not make a review look
 * unfinished — it is counted on its own instead, as information rather than
 * a blocker. The grade counts do include graded exceeds, because those are
 * genuinely part of the review.
 */
export type Tally = {
  met: number
  questioned: number
  needs: number
  unreviewed: number
  reviewed: number
  total: number
  exceedsUngraded: number
  /**
   * How many exceeds the project has at all. Needed to tell "every exceeds
   * is graded" apart from "there are none" — saying "all exceeds reviewed"
   * about a project without any would be a claim about nothing.
   */
  exceedsTotal: number
}
