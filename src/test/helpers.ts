import type { ProjectDetail } from '@/sanity/types'
import { newReview } from '@/review/reducer'
import { requirementIds } from '@/review/selectors'
import type { Grade, Grades, Review } from '@/review/types'
import projects from './fixtures/projects.json'

export const PROJECTS = projects as unknown as ProjectDetail[]

export function fixture(title: string): ProjectDetail {
  const project = PROJECTS.find((p) => p.title === title)
  if (!project) throw new Error(`No fixture project titled "${title}"`)
  return project
}

export const GAME_SHOW = fixture('Game Show App')
export const PUBLIC_API = fixture('Public API Requests')

export function idsOf(project: ProjectDetail): string[] {
  return requirementIds(project)
}

export function gradesFrom(entries: Array<[string, Grade, string?]>): Grades {
  const grades: Grades = {}
  for (const [id, grade, note] of entries) grades[id] = { grade, note: note ?? '' }
  return grades
}

export function reviewFor(project: ProjectDetail, grades: Grades = {}): Review {
  return {
    ...newReview(project._id, project.techdegree?._id ?? null),
    grades,
  }
}
