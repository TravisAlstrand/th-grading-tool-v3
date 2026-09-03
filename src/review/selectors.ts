import type { GradingSection, ProjectDetail, Requirement } from '@/sanity/types'
import type { Grade, Grades, Tally } from './types'

export type FlatRequirement = {
  req: Requirement
  section: GradingSection
  sectionIndex: number
}

/** Every requirement in rubric order, each carrying its section context. */
export function flatRequirements(project: ProjectDetail | null | undefined): FlatRequirement[] {
  if (!project) return []
  const out: FlatRequirement[] = []
  project.gradingSections?.forEach((section, sectionIndex) => {
    section.requirements?.forEach((req) => {
      out.push({ req, section, sectionIndex })
    })
  })
  return out
}

export function requirementIds(project: ProjectDetail | null | undefined): string[] {
  return flatRequirements(project).map(({ req }) => req._id)
}

/** The optional ones. Ungraded, they neither block a review nor enter it. */
export function exceedsIds(project: ProjectDetail | null | undefined): string[] {
  return flatRequirements(project)
    .filter(({ req }) => req.isExceeds)
    .map(({ req }) => req._id)
}

export function tally(
  ids: string[],
  grades: Grades,
  exceeds: readonly string[] = [],
): Tally {
  const optional = new Set(exceeds)
  const t: Tally = {
    met: 0,
    questioned: 0,
    needs: 0,
    unreviewed: 0,
    reviewed: 0,
    total: ids.length - optional.size,
    exceedsUngraded: 0,
  }
  for (const id of ids) {
    const grade = grades[id]?.grade
    if (grade) {
      t[grade] += 1
      if (!optional.has(id)) t.reviewed += 1
    } else if (optional.has(id)) {
      t.exceedsUngraded += 1
    } else {
      t.unreviewed += 1
    }
  }
  return t
}

/** The worst grade present in a section, for the rail's status dot. */
export function sectionStatus(section: GradingSection, grades: Grades): Grade | 'unreviewed' {
  const reqs = section.requirements ?? []
  if (reqs.some((r) => !grades[r._id])) return 'unreviewed'
  if (reqs.some((r) => grades[r._id]?.grade === 'needs')) return 'needs'
  if (reqs.some((r) => grades[r._id]?.grade === 'questioned')) return 'questioned'
  if (reqs.some((r) => grades[r._id]?.grade === 'met')) return 'met'
  // Everything graded and nothing flagged: the section passed.
  return 'met'
}

export function countExceeds(project: ProjectDetail | null | undefined): number {
  return flatRequirements(project).filter(({ req }) => req.isExceeds).length
}
