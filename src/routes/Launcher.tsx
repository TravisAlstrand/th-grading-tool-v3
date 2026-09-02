import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTechdegreeIndex } from '@/sanity/hooks'
import type { ProjectSummary, TechdegreeSummary } from '@/sanity/types'
import { deleteDraft, loadDrafts } from '@/review/storage'
import type { Draft } from '@/review/types'
import { ago, plural } from '@/lib/time'
import { cn } from '@/lib/cn'
import { Button, Kbd, Label, Logo } from '@/components/primitives'
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews'
import { ThemeToggle } from '@/components/Theme'
import { useToast } from '@/components/Toast'

export function Launcher() {
  const { data, isPending, isError, error, refetch } = useTechdegreeIndex()
  const [searchParams, setSearchParams] = useSearchParams()
  const [drafts, setDrafts] = useState<Draft[]>(() => loadDrafts())
  const navigate = useNavigate()
  const flash = useToast()

  const techdegrees = data ?? []
  const activeId = searchParams.get('td')
  const active = useMemo<TechdegreeSummary | null>(
    () => techdegrees.find((t) => t._id === activeId) ?? techdegrees[0] ?? null,
    [techdegrees, activeId],
  )

  const byProjectId = useMemo(() => {
    const map = new Map<string, { project: ProjectSummary; td: TechdegreeSummary }>()
    for (const td of techdegrees) {
      for (const project of td.projects ?? []) map.set(project._id, { project, td })
    }
    return map
  }, [techdegrees])

  const knownDrafts = drafts.filter((d) => byProjectId.has(d.projectId))

  if (isPending) return <LoadingState label="Loading techdegrees" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!techdegrees.length) {
    return (
      <EmptyState
        title="No techdegrees in this dataset."
        body="The query succeeded but came back with nothing. Check the dataset name in your .env."
      />
    )
  }

  const discard = (draft: Draft, title: string) => {
    if (!window.confirm(`Discard the saved review for ${title}?`)) return
    deleteDraft(draft.projectId)
    setDrafts(loadDrafts())
    flash('Draft discarded', 'plain')
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Techdegree rail */}
      <div className="flex w-[268px] shrink-0 flex-col border-r border-line bg-panel max-rails:hidden">
        <div className="flex items-center gap-2.5 border-b border-line p-[18px] font-bold tracking-[-.01em]">
          <Logo />
          Grading
          <Kbd className="ml-auto">⌘K</Kbd>
        </div>
        <Label className="px-[18px] pt-4 pb-2">Techdegrees</Label>
        <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {techdegrees.map((td) => (
            <button
              key={td._id}
              type="button"
              aria-current={td._id === active?._id}
              className={cn(
                'flex w-full items-center gap-[11px] rounded-[7px] p-2.5 text-left text-[13.5px]',
                td._id === active?._id
                  ? 'bg-surface-2 font-semibold text-ink'
                  : 'text-ink-2 hover:bg-surface',
              )}
              onClick={() => setSearchParams({ td: td._id })}
            >
              <span
                className="h-[18px] w-[3px] shrink-0 rounded-sm"
                style={{ background: td.color ?? '#6FD3B4' }}
              />
              <span className="truncate">{td.name}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-4">
                {td.projects?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-[18px] py-3.5 text-[12.5px] text-ink-3">
          <span>Rubrics from Sanity</span>
          <span className="ml-auto font-mono text-[10.5px] text-questioned">
            {knownDrafts.length} {plural(knownDrafts.length, 'draft')}
          </span>
        </div>
      </div>

      {/* Project table */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b border-line px-8 pt-6 pb-[18px] max-rails:px-[18px]">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: active?.color ?? '#6FD3B4' }}
            />
            <h1 className="m-0 text-[22px] font-bold tracking-[-.015em]">{active?.name}</h1>
            {/* The rail carries the branding but hides below 900px, so the
                toggle lives here where it survives every breakpoint. */}
            <ThemeToggle className="ml-auto" />
          </div>
          <p className="mt-[5px] mb-0 text-[13px] text-ink-3">
            {active?.projects?.length ?? 0} {plural(active?.projects?.length ?? 0, 'project')} ·
            press <span className="font-mono">⌘K</span> to search every techdegree
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5 max-rails:px-[18px]">
          {knownDrafts.slice(0, 3).map((draft) => {
            const found = byProjectId.get(draft.projectId)!
            const reviewed = Object.keys(draft.grades).length
            return (
              <div
                key={draft.projectId}
                className="mb-5 flex flex-wrap items-center gap-4 rounded-[9px] border border-resume-edge bg-resume px-[18px] py-[13px]"
              >
                <Label className="!text-accent">Resume</Label>
                <span className="text-[13.5px] font-semibold">{found.project.title}</span>
                <span className="text-[12.5px] text-ink-3">
                  {reviewed} of {found.project.requirementCount} reviewed · saved{' '}
                  {ago(draft.updatedAt)}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/review/${draft.projectId}`)}
                  >
                    Continue
                  </Button>
                  <Button onClick={() => discard(draft, found.project.title)}>Discard</Button>
                </div>
              </div>
            )
          })}

          {!active?.projects?.length ? (
            <EmptyState
              title={`${active?.name ?? 'This techdegree'} has no projects yet.`}
              body="Nothing to grade here until projects are added in Sanity."
            />
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-[44px_minmax(0,1fr)_130px_100px_120px] items-center gap-4 border-b border-line px-3 pb-2.5 font-mono text-[10px] tracking-[.12em] text-ink-4 uppercase max-rails:grid-cols-[36px_minmax(0,1fr)_90px]">
                <span>#</span>
                <span>Project</span>
                <span>Requirements</span>
                <span className="max-rails:hidden">Exceeds</span>
                <span className="max-rails:hidden">Status</span>
              </div>
              {active.projects.map((project) => {
                const draft = drafts.find((d) => d.projectId === project._id)
                return (
                  <button
                    key={project._id}
                    type="button"
                    className="grid w-full grid-cols-[44px_minmax(0,1fr)_130px_100px_120px] items-center gap-4 border-b border-line-soft p-3 text-left text-ink-2 hover:bg-surface max-rails:grid-cols-[36px_minmax(0,1fr)_90px]"
                    onClick={() => navigate(`/review/${project._id}`)}
                  >
                    <span className="font-mono text-[12px] text-ink-4">
                      {String(project.projectNumber ?? 0).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[14px]">{project.title}</span>
                    <span className="font-mono text-[12.5px] text-ink-3">
                      {project.requirementCount}
                    </span>
                    <span className="font-mono text-[12.5px] text-ink-3 max-rails:hidden">
                      {project.exceedsCount}
                    </span>
                    <span
                      className={cn(
                        'text-[12px] max-rails:hidden',
                        draft ? 'text-questioned' : 'text-ink-4',
                      )}
                    >
                      {draft
                        ? `${Object.keys(draft.grades).length} of ${project.requirementCount} reviewed`
                        : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
