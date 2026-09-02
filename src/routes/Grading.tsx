import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReviewContext } from './ReviewLayout'
import { flatRequirements, sectionStatus } from '@/review/selectors'
import { takesNote } from '@/review/grades'
import { useGradingKeys } from '@/review/useGradingKeys'
import type { Grade } from '@/review/types'
import { usePaletteOpen } from '@/components/CommandPalette'
import { OutputPanel } from '@/components/OutputPanel'
import { RequirementRow } from '@/components/RequirementRow'
import { Button, Kbd, Label } from '@/components/primitives'
import { ThemeToggle } from '@/components/Theme'
import { useToast } from '@/components/Toast'
import { ago, plural } from '@/lib/time'
import { cn } from '@/lib/cn'

const DOT: Record<Grade | 'unreviewed', string> = {
  met: 'bg-met',
  questioned: 'bg-questioned',
  needs: 'bg-needs',
  skipped: 'bg-edge-2 opacity-50',
  unreviewed: 'bg-edge-2',
}

const SEG: Record<Grade, string> = {
  met: 'bg-met',
  questioned: 'bg-questioned',
  needs: 'bg-needs',
  skipped: 'bg-edge-2',
}

export function Grading() {
  const { project, session } = useReviewContext()
  const { review, tally, dispatch, savedAt, saveFailed, canUndo } = session
  const navigate = useNavigate()
  const flash = useToast()
  const paletteOpen = usePaletteOpen()

  const list = useMemo(() => flatRequirements(project), [project])
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const focusedRowRef = useRef<HTMLDivElement>(null)
  const wantEditorFocus = useRef(0)

  const focusedEntry = review.focusReqId ? review.grades[review.focusReqId] : undefined

  const focusEditor = useCallback(() => {
    wantEditorFocus.current += 1
    // The textarea may not exist until the grade that opens it has rendered.
    queueMicrotask(() => {
      const ta = editorRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    })
  }, [])

  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [review.focusReqId])

  const onGrade = useCallback(
    (grade: Grade) => {
      const reqId = review.focusReqId
      if (!reqId) return
      const wasSame = review.grades[reqId]?.grade === grade
      dispatch({ type: 'grade', reqId, grade })
      // Flagging drops you straight into the note; passing moves you on.
      if (!wasSame && takesNote(grade)) focusEditor()
    },
    [dispatch, focusEditor, review.focusReqId, review.grades],
  )

  useGradingKeys(!paletteOpen, {
    onMove: (delta) => dispatch({ type: 'move', delta }),
    onGrade,
    onAdvance: () => dispatch({ type: 'advance' }),
    onMarkRemaining: () => {
      if (!tally.unreviewed) {
        flash('Nothing left unreviewed', 'plain')
        return
      }
      const n = tally.unreviewed
      dispatch({ type: 'markRemainingMet' })
      flash(`Marked ${n} as met`)
    },
    onEditNote: () => {
      if (!takesNote(focusedEntry?.grade)) {
        flash('Notes go on questionable and needs-work items', 'plain')
        return
      }
      focusEditor()
    },
    onUndo: () => {
      if (!canUndo) {
        flash('Nothing to undo', 'plain')
        return
      }
      dispatch({ type: 'undo' })
    },
    onSend: () => navigate(`/review/${project._id}/send`),
    onBack: () => navigate('/'),
  })

  const tdName = project.techdegree?.name ?? 'Techdegree'

  return (
    <>
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-[18px] border-b border-line bg-panel px-6 py-3 max-rails:gap-3 max-rails:px-4 max-rails:py-2.5">
        <Button onClick={() => navigate('/')}>← Projects</Button>
        <span className="tdchip" />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[14px] font-semibold tracking-[-.01em]">
            {project.title}
          </span>
          <span className="font-mono text-[10.5px] text-ink-4">
            {tdName} · project {String(project.projectNumber ?? 0).padStart(2, '0')} · {tally.total}{' '}
            {plural(tally.total, 'requirement')}
          </span>
        </div>

        <div className="flex min-w-0 max-w-[420px] flex-1 gap-[3px] max-rails:max-w-none">
          {list.map(({ req }) => {
            const grade = review.grades[req._id]?.grade
            const focused = req._id === review.focusReqId
            return (
              <span
                key={req._id}
                className={cn(
                  'h-1.5 min-w-1 flex-1 rounded-sm',
                  focused ? 'bg-ink' : grade ? SEG[grade] : 'bg-edge',
                )}
              />
            )
          })}
        </div>

        <span
          className={cn('font-mono text-[11px]', saveFailed ? 'text-needs' : 'text-ink-4')}
          data-testid="save-state"
        >
          {saveFailed
            ? 'not saved — storage blocked'
            : savedAt
              ? `saved ${ago(savedAt)}`
              : 'nothing to save yet'}
        </span>

        <ThemeToggle />

        <Button
          onClick={() => {
            if (!tally.unreviewed) {
              flash('Nothing left unreviewed', 'plain')
              return
            }
            const n = tally.unreviewed
            dispatch({ type: 'markRemainingMet' })
            flash(`Marked ${n} as met`)
          }}
        >
          Mark remaining as met
          <Kbd>M</Kbd>
        </Button>

        <Button
          variant={tally.unreviewed ? 'held' : 'primary'}
          onClick={() => navigate(`/review/${project._id}/send`)}
        >
          Review &amp; send
          <Kbd>⌘↵</Kbd>
        </Button>
      </div>

      {/* Section rail · requirements · live output */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[236px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-panel px-2.5 py-4 max-rails:hidden">
          <Label className="px-2.5 pb-2.5">Sections</Label>
          {project.gradingSections?.map((section, i) => {
            const inSection = (section.requirements ?? []).some(
              (r) => r._id === review.focusReqId,
            )
            const status = sectionStatus(section, review.grades)
            return (
              <button
                key={section._id}
                type="button"
                aria-current={inSection}
                className={cn(
                  'flex w-full items-center gap-[11px] rounded-[7px] p-2.5 text-left text-[13px]',
                  inSection ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-2 hover:bg-surface',
                )}
                onClick={() => {
                  const first = section.requirements?.[0]
                  if (first) dispatch({ type: 'focus', reqId: first._id })
                }}
              >
                <span
                  className={cn(
                    'font-mono text-[10.5px]',
                    inSection ? 'text-accent' : 'text-ink-4',
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="truncate">{section.title}</span>
                <span
                  className="ml-auto flex shrink-0 gap-[3px]"
                  aria-label={`${section.title}: ${status}`}
                >
                  {(section.requirements ?? []).map((r) => {
                    const g = review.grades[r._id]?.grade
                    const focused = r._id === review.focusReqId
                    return (
                      <span
                        key={r._id}
                        className={cn(
                          'h-[5px] w-[5px] rounded-full',
                          focused ? 'bg-ink' : DOT[g ?? 'unreviewed'],
                        )}
                      />
                    )
                  })}
                </span>
              </button>
            )
          })}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {project.gradingSections?.map((section, sectionIndex) => (
            <div key={section._id}>
              <div className="sticky top-0 z-2 flex items-center gap-2.5 border-b border-line bg-sechead px-6 pt-3.5 pb-[11px] max-rails:px-4 max-rails:pt-3 max-rails:pb-2.5">
                <Label className="!text-accent">
                  {String(sectionIndex + 1).padStart(2, '0')} · {section.title}
                </Label>
                <span className="font-mono text-[10.5px] text-ink-4">
                  {section.requirements?.length ?? 0}{' '}
                  {plural(section.requirements?.length ?? 0, 'requirement')}
                </span>
              </div>
              {(section.requirements ?? []).map((req) => {
                const focused = req._id === review.focusReqId
                return (
                  <RequirementRow
                    key={req._id}
                    ref={focused ? focusedRowRef : undefined}
                    req={req}
                    entry={review.grades[req._id]}
                    focused={focused}
                    editorRef={editorRef}
                    onFocus={() => dispatch({ type: 'focus', reqId: req._id })}
                    onGrade={(grade) => {
                      if (!focused) dispatch({ type: 'focus', reqId: req._id })
                      const wasSame = review.grades[req._id]?.grade === grade
                      dispatch({ type: 'grade', reqId: req._id, grade })
                      if (!wasSame && takesNote(grade)) focusEditor()
                    }}
                    onNoteChange={(note) => dispatch({ type: 'setNote', reqId: req._id, note })}
                  />
                )
              })}
            </div>
          ))}
        </div>

        <OutputPanel review={review} project={project} unreviewed={tally.unreviewed} />
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-5 border-t border-line bg-panel px-6 py-[9px] font-mono text-[11px] text-ink-4 max-rails:gap-3 max-rails:px-4 max-rails:text-[10px]">
        <span className="text-met">{tally.met} met</span>
        <span className="text-questioned">{tally.questioned} questioned</span>
        <span className="text-needs">{tally.needs} needs work</span>
        {tally.skipped > 0 && <span>{tally.skipped} not attempted</span>}
        <span data-testid="unreviewed-count">{tally.unreviewed} unreviewed</span>
        <span className="ml-auto">
          J K move · 1 2 3 0 grade · same key clears · E note · M mark rest · ⌘Z undo · ⌘K search ·
          ⌘↵ review
        </span>
      </div>
    </>
  )
}
