import { useEffect } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useProject } from '@/sanity/hooks'
import type { ProjectDetail } from '@/sanity/types'
import { useReviewSession, type ReviewSession } from '@/review/useReviewSession'
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews'
import { Button } from '@/components/primitives'

export type ReviewContext = {
  project: ProjectDetail
  session: ReviewSession
}

export function useReviewContext(): ReviewContext {
  return useOutletContext<ReviewContext>()
}

const DEFAULT_TD_COLOUR = '#6FD3B4'

/**
 * Owns the review for one project id, for both the grading screen and the
 * send screen. The review lives at a URL, so it survives a reload and a
 * back button, and a reviewer can keep one open per tab.
 */
export function ReviewLayout() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const { data: project, isPending, isError, error, refetch } = useProject(projectId)
  const session = useReviewSession(projectId, project)

  useEffect(() => {
    const colour = project?.techdegree?.color ?? DEFAULT_TD_COLOUR
    document.documentElement.style.setProperty('--td', colour)
    return () => document.documentElement.style.setProperty('--td', DEFAULT_TD_COLOUR)
  }, [project])

  if (isPending) return <LoadingState label="Loading rubric" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  if (!project) {
    return (
      <EmptyState
        title="No project with that id."
        body="It may have been removed from Sanity, or the link may be stale."
      />
    )
  }

  if (!session.requirementIds.length) {
    return (
      <div className="grid flex-1 place-items-center p-8">
        <div className="flex max-w-[460px] flex-col items-start gap-3">
          <span className="label">Nothing to grade</span>
          <p className="m-0 text-[15px] font-semibold text-ink">
            {project.title} has no requirements yet.
          </p>
          <p className="m-0 text-[13px] leading-relaxed text-ink-3">
            The project exists in Sanity but no grading sections or requirements are attached to it.
          </p>
          <Button className="mt-1" onClick={() => navigate('/')}>
            ← Back to projects
          </Button>
        </div>
      </div>
    )
  }

  return <Outlet context={{ project, session } satisfies ReviewContext} />
}
