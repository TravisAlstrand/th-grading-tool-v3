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
  template: TemplateId
}

/**
 * What actually goes into localStorage. `updatedAt` is stamped by the store
 * on write, which is what keeps the reducer pure — it never reads the clock.
 */
export type Draft = Review & { updatedAt: number }

export type Tally = {
  met: number
  questioned: number
  needs: number
  unreviewed: number
  reviewed: number
  total: number
}
