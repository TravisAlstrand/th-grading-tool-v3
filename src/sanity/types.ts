/**
 * Hand-written types for the Techdegree rubric dataset.
 *
 * Written against the live schema (project `supw1mz3`, dataset `production`),
 * which has five document types: techdegree, project, gradingSection,
 * requirement and resource. Requirements reference their gradingSection,
 * project and techdegree; sections reference their project and techdegree.
 *
 * Two fields are typed as nullable on purpose, because in the dataset as it
 * stands today they always are:
 *   - `Requirement.description` is null for all 1,323 requirements.
 *   - `ProjectDetail.studyGuide` is set on 16 of 65 projects.
 * The UI renders both only when present, so authoring content in Sanity
 * later lights them up with no code change.
 */

export type TechdegreeRef = {
  _id: string
  name: string
  abbr: string | null
  color: string | null
}

export type ProjectSummary = {
  _id: string
  title: string
  projectNumber: number | null
  requirementCount: number
  exceedsCount: number
}

export type TechdegreeSummary = TechdegreeRef & {
  projects: ProjectSummary[]
}

export type Requirement = {
  _id: string
  title: string
  description: string | null
  isExceeds: boolean
  order: number | null
}

export type GradingSection = {
  _id: string
  title: string
  order: number | null
  requirements: Requirement[]
}

export type ProjectDetail = {
  _id: string
  title: string
  projectNumber: number | null
  studyGuide: string | null
  techdegree: TechdegreeRef | null
  gradingSections: GradingSection[]
}
