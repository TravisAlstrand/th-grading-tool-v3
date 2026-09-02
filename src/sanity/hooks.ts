import { useQuery } from '@tanstack/react-query'
import { sanityFetch } from './client'
import { INDEX_QUERY, PROJECT_QUERY } from './queries'
import type { ProjectDetail, TechdegreeSummary } from './types'

/** Rubrics change when someone edits Sanity, which is rare. Cache hard. */
const FIVE_MINUTES = 5 * 60 * 1000

export function useTechdegreeIndex() {
  return useQuery({
    queryKey: ['techdegree-index'],
    queryFn: ({ signal }) => sanityFetch<TechdegreeSummary[]>(INDEX_QUERY, {}, signal),
    staleTime: FIVE_MINUTES,
    retry: 1,
  })
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: ({ signal }) =>
      sanityFetch<ProjectDetail | null>(PROJECT_QUERY, { projectId: projectId! }, signal),
    enabled: Boolean(projectId),
    staleTime: FIVE_MINUTES,
    retry: 1,
  })
}
