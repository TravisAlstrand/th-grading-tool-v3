import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTechdegreeIndex } from '@/sanity/hooks'
import type { ProjectSummary, TechdegreeSummary } from '@/sanity/types'
import { deleteDraft, loadDrafts } from '@/review/storage'
import type { Draft } from '@/review/types'
import { ago, plural } from '@/lib/time'
import { cn } from '@/lib/cn'
import { Button, ConfirmButton, Label, Logo, ShortcutsHint } from '@/components/primitives'
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews'
import { ThemeToggle } from '@/components/Theme'
import { useToast } from '@/components/Toast'
import { useOpenShortcuts, useOverlayOpen } from '@/components/Overlays'
import { isTypingTarget } from '@/review/useGradingKeys'

/**
 * The techdegree picker is rendered twice — once in the rail, once in the
 * narrow header — and CSS hides whichever one does not fit. Anything that
 * moves focus has to ask which copy is on screen: a ref to the rail's first
 * button was still a ref below 990px, where that button is `display: none`,
 * so the launcher opened with focus on <body> and J/K did nothing until you
 * clicked something.
 */
const navItems = (list: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(`[data-nav-list="${list}"] [data-nav-item]`),
  ].filter((el) => el.offsetParent !== null)

export function Launcher() {
  const { data, isPending, isError, error, refetch } = useTechdegreeIndex()
  const [searchParams, setSearchParams] = useSearchParams()
  const [drafts, setDrafts] = useState<Draft[]>(() => loadDrafts())
  const navigate = useNavigate()
  const flash = useToast()

  const techdegrees = data ?? []
  const activeId = searchParams.get('td')
  const active = useMemo<TechdegreeSummary | null>(
    () => techdegrees.find((t) => t._id === activeId) ?? null,
    [techdegrees, activeId],
  )
  const overlayOpen = useOverlayOpen()
  const openShortcuts = useOpenShortcuts()

  // Put the keyboard where the next choice is: the techdegree list when
  // nothing is picked, the project list once something is. Depends on the
  // data too — the first render is the loading state, so a mount-only effect
  // would find no button to focus.
  useEffect(() => {
    navItems(activeId ? 'projects' : 'techdegrees')[0]?.focus()
  }, [activeId, techdegrees.length])

  /**
   * J/K move through whichever list holds the focus, matching the grading
   * screen. Focus is the state — no separate "which pane is active" to keep
   * in sync, and Enter is just a button press, so it already works.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (overlayOpen || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const focused = document.activeElement
      if (!(focused instanceof HTMLElement)) return

      // Esc comes back out of the projects to the techdegree that opened them.
      if (e.key === 'Escape') {
        if (focused.closest('[data-nav-list="techdegrees"]')) return
        const items = navItems('techdegrees')
        const target = items.find((el) => el.getAttribute('aria-current') === 'true') ?? items[0]
        if (!target) return
        e.preventDefault()
        target.focus()
        return
      }

      const down = e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown'
      const up = e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp'
      if (!down && !up) return

      const list = focused.closest('[data-nav-list]')
      if (!list) return
      const items = [...list.querySelectorAll<HTMLElement>('[data-nav-item]')]
      const at = items.indexOf(focused)
      if (at === -1) return

      e.preventDefault()
      const next = items[Math.max(0, Math.min(items.length - 1, at + (down ? 1 : -1)))]
      next?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlayOpen])

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

  const discard = (draft: Draft) => {
    deleteDraft(draft.projectId)
    setDrafts(loadDrafts())
    flash('Draft discarded', 'plain')
  }

  return (
    <>
      <div data-testid="launcher" className="flex min-h-0 flex-1">
        {/* Techdegree rail */}
        <div className="flex w-[295px] shrink-0 flex-col border-r border-line bg-panel max-rails:hidden">
          <div className="flex items-center gap-2.5 border-b border-line p-[20px] font-bold tracking-[-.01em]">
            <Logo />
            Grading Tool v3
          </div>
          <Label className="px-[20px] pt-4 pb-2">Techdegrees</Label>
          <div data-nav-list="techdegrees" className="flex flex-col gap-0.5 overflow-y-auto p-2">
            {techdegrees.map((td) => (
              <button
                key={td._id}
                type="button"
                data-testid="techdegree"
                data-nav-item=""
                aria-current={td._id === active?._id}
                className={cn(
                  'flex w-full items-center gap-[12px] rounded-[7.5px] p-2.5 text-left text-[15px]',
                  td._id === active?._id
                    ? 'bg-surface-2 font-semibold text-ink'
                    : 'text-ink-2 hover:bg-surface',
                )}
                onClick={() => setSearchParams({ td: td._id })}
              >
                <span
                  className="h-[20px] w-[3.5px] shrink-0 rounded-sm"
                  style={{ background: td.color ?? '#6FD3B4' }}
                />
                <span className="truncate">{td.name}</span>
                <span className="ml-auto font-mono text-[12px] text-ink-4">
                  {td.projects?.length ?? 0}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-auto flex items-center gap-2.5 border-t border-line p-2.5 text-[14px] text-ink-3">
            <ThemeToggle />
            <span className="ml-auto font-mono text-[11.5px] text-questioned">
              {knownDrafts.length} {plural(knownDrafts.length, 'draft')}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* The rail is hidden below 900px, so the picker and the theme toggle
              need a home here or the launcher has neither. */}
          <div className="flex flex-col gap-2.5 border-b border-line px-[20px] py-3 rails:hidden">
            <div className="flex items-center gap-2.5 font-bold tracking-[-.01em]">
              <Logo />
              Grading Tool v3
              <ThemeToggle className="ml-auto" />
            </div>
            {/* Pills sized by their own text wrapped into a ragged block, and
                dropped the project count the rail shows. Equal tracks instead:
                auto-fit gives every cell the same width and stretches the last
                row to fill, so the row stays a block rather than a staircase.
                240px is the width the longest techdegree name reads at without
                truncating. */}
            <div
              data-nav-list="techdegrees"
              className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-1.5"
            >
              {techdegrees.map((td) => (
                <button
                  key={td._id}
                  type="button"
                  data-testid="techdegree"
                  data-nav-item=""
                  aria-current={td._id === active?._id}
                  className={cn(
                    'flex w-full items-center gap-[12px] rounded-[7.5px] border px-[12px] py-2 text-left text-[14px]',
                    td._id === active?._id
                      ? 'border-edge-2 bg-surface-2 font-semibold text-ink'
                      : 'border-edge text-ink-2 hover:bg-surface',
                  )}
                  onClick={() => setSearchParams({ td: td._id })}
                >
                  <span
                    className="h-[16px] w-[3.5px] shrink-0 rounded-sm"
                    style={{ background: td.color ?? '#6FD3B4' }}
                  />
                  <span className="truncate">{td.name}</span>
                  <span className="ml-auto font-mono text-[12px] text-ink-4">
                    {td.projects?.length ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Drafts are not owned by the selected techdegree — a Data Analysis
              review sitting under the Front End heading read as if it were. They
              sit above the heading, and show whether or not anything is picked. */}
          {knownDrafts.length > 0 && (
            <div
              data-testid="resume-drafts"
              className="flex flex-col gap-2.5 border-b border-line px-8 py-5 max-rails:px-[20px]"
            >
              <Label>Unfinished reviews</Label>
              {knownDrafts.slice(0, 3).map((draft) => {
                const found = byProjectId.get(draft.projectId)!
                const reviewed = Object.keys(draft.grades).length
                return (
                  <div
                    key={draft.projectId}
                    className="flex flex-wrap items-center gap-4 rounded-[10px] border border-resume-edge bg-resume px-[20px] py-[14.5px]"
                  >
                    <Label className="!text-accent">Resume</Label>
                    <span className="text-[15px] font-semibold">{found.project.title}</span>
                    <span className="text-[14px] text-ink-3">
                      {found.td.abbr ?? found.td.name} · {reviewed} of{' '}
                      {found.project.requirementCount} reviewed · saved {ago(draft.updatedAt)}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button variant="primary" onClick={() => navigate(`/review/${draft.projectId}`)}>
                        Continue
                      </Button>
                      <ConfirmButton
                        variant="danger"
                        confirmLabel="Discard?"
                        onConfirm={() => discard(draft)}
                      >
                        Discard
                      </ConfirmButton>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {active && (
            <div className="border-b border-line px-8 pt-6 pb-[20px] max-rails:px-[20px]">
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: active.color ?? '#6FD3B4' }}
                />
                <h1 className="m-0 text-[24px] font-bold tracking-[-.015em]">{active.name}</h1>
              </div>
              <p className="mt-[5.5px] mb-0 text-[14.5px] text-ink-3">
                {active.projects?.length ?? 0} {plural(active.projects?.length ?? 0, 'project')}
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-5 max-rails:px-[20px]">
            {!active ? null : !active.projects?.length ? (
              <EmptyState
                title={`${active.name} has no projects yet.`}
                body="Nothing to grade here until projects are added in Sanity."
              />
            ) : (
              <div data-nav-list="projects" className="flex flex-col">
                <div className="grid grid-cols-[48px_minmax(0,1fr)_143px_110px] items-center gap-4 border-b border-line px-3 pb-2.5 font-mono text-[11px] tracking-[.12em] text-ink-4 uppercase max-rails:grid-cols-[39.5px_minmax(0,1fr)_99px]">
                  <span>#</span>
                  <span>Project</span>
                  <span>Requirements</span>
                  <span className="max-rails:hidden">Exceeds</span>
                </div>
                {active.projects.map((project) => (
                  <button
                    key={project._id}
                    type="button"
                    data-nav-item=""
                    data-testid="project"
                    className="grid w-full grid-cols-[48px_minmax(0,1fr)_143px_110px] items-center gap-4 border-b border-line-soft p-3 text-left text-ink-2 hover:bg-surface max-rails:grid-cols-[39.5px_minmax(0,1fr)_99px]"
                    onClick={() => navigate(`/review/${project._id}`)}
                  >
                    <span className="font-mono text-[13px] text-ink-4">
                      {String(project.projectNumber ?? 0).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[15.5px]">{project.title}</span>
                    <span className="font-mono text-[14px] text-ink-3">
                      {project.requirementCount}
                    </span>
                    <span className="font-mono text-[14px] text-ink-3 max-rails:hidden">
                      {project.exceedsCount}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Same status bar as the grading screen, so the controls live in the
          same place on both. */}
      <div className="flex shrink-0 items-center gap-5 border-t border-line bg-panel px-6 py-[10px] font-mono text-[12px] text-ink-4 max-rails:gap-3 max-rails:px-4 max-rails:text-[11px]">
        <ShortcutsHint className="ml-auto" onClick={openShortcuts} />
      </div>
    </>
  )
}
