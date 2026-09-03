import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReviewContext } from './ReviewLayout'
import { sectionStatus } from '@/review/selectors'
import { GRADES, takesNote } from '@/review/grades'
import { useGradingKeys } from '@/review/useGradingKeys'
import type { Grade } from '@/review/types'
import { useOpenShortcuts, useOverlayOpen } from '@/components/Overlays'
import { OutputPanel } from '@/components/OutputPanel'
import { RequirementRow } from '@/components/RequirementRow'
import { Button, Kbd, Label, ShortcutsHint } from '@/components/primitives'
import { ThemeToggle } from '@/components/Theme'
import { useToast } from '@/components/Toast'
import { plural } from '@/lib/time'
import { cn } from '@/lib/cn'
import { ENTER, chord } from '@/lib/platform'

const DOT: Record<Grade | 'unreviewed', string> = {
  met: 'bg-met',
  questioned: 'bg-questioned',
  needs: 'bg-needs',
  unreviewed: 'bg-edge-2',
}

/**
 * The section header was `Label`-sized — 11px uppercase against 15px
 * requirement text — so it read as quieter than the rows it was organising.
 * It is now the largest thing in the column, and carries its own progress so
 * you can see where you are in a section without counting rows.
 *
 * It sits on `bg-sechead`, which is tinted toward the accent rather than
 * being another step on the grey ramp: at the value differences this palette
 * works in, a shade alone was indistinguishable from a row. The gap above it
 * comes from the section wrapper, so a header that has stuck to the top of
 * the column still sits flush against it.
 */
function SectionHeader({
  index,
  title,
  total,
  graded,
}: {
  index: number
  title: string
  total: number
  graded: number
}) {
  const done = total > 0 && graded === total
  return (
    <div className="sticky top-0 z-2 flex items-center gap-3 border-y border-sechead-edge bg-sechead px-6 py-[13px] max-rails:px-4 max-rails:py-2.5">
      <span className="font-mono text-[16px] font-semibold text-accent">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h2 className="m-0 font-mono text-[16px] font-bold tracking-[.1em] text-ink uppercase">
        {title}
      </h2>
      <span
        className={cn(
          'ml-auto shrink-0 font-mono text-[11.5px]',
          done ? 'text-met' : 'text-ink-4',
        )}
      >
        {graded} of {total} graded
      </span>
    </div>
  )
}

export function Grading() {
  const { project, session } = useReviewContext()
  const { review, tally, dispatch, saveFailed, canUndo } = session
  const navigate = useNavigate()
  const flash = useToast()
  const overlayOpen = useOverlayOpen()
  const openShortcuts = useOpenShortcuts()

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

  useGradingKeys(!overlayOpen, {
    onMove: (delta) => dispatch({ type: 'move', delta }),
    onGrade,
    onAdvance: () => dispatch({ type: 'advance' }),
    onMarkRemaining: () => {
      if (!tally.unreviewed) {
        flash('Nothing left unreviewed', 'plain')
        return
      }
      const n = tally.unreviewed
      dispatch({ type: 'markRemainingMet', scope: 'required' })
      flash(`Marked ${n} as ${GRADES.met.word}`)
    },
    onMarkExceeds: () => {
      if (!tally.exceedsUngraded) {
        flash('No ungraded exceeds requirements', 'plain')
        return
      }
      const n = tally.exceedsUngraded
      dispatch({ type: 'markRemainingMet', scope: 'exceeds' })
      flash(`Marked ${n} ${plural(n, 'exceeds requirement')} as ${GRADES.met.word}`)
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
      <div className="flex shrink-0 flex-wrap items-center gap-[20px] border-b border-line bg-panel px-6 py-3 max-rails:gap-3 max-rails:px-4 max-rails:py-2.5">
        <Button variant="nav" onClick={() => navigate('/')}>
          ← Projects
        </Button>
        <span className="tdchip" />
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[15.5px] font-semibold tracking-[-.01em]">
            {project.title}
          </span>
          <span className="font-mono text-[11.5px] text-ink-4">
            {tdName} · project {String(project.projectNumber ?? 0).padStart(2, '0')}
          </span>
        </div>

        {saveFailed && (
          <span className="font-mono text-[12px] text-needs" data-testid="save-state">
            not saved — storage blocked
          </span>
        )}

        {/* The rail below carries the toggle; this one covers the widths
            where the rail is hidden. */}
        <ThemeToggle className="rails:hidden" />

        <Button
          variant={tally.unreviewed ? 'held' : 'primary'}
          onClick={() => navigate(`/review/${project._id}/send`)}
        >
          Review &amp; send
          <Kbd>{chord(ENTER)}</Kbd>
        </Button>
      </div>

      {/* Section rail · requirements · live output */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[260px] shrink-0 flex-col border-r border-line bg-panel max-rails:hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-4">
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
                    'flex w-full items-center gap-[12px] rounded-[7.5px] p-2.5 text-left text-[14.5px]',
                    inSection ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-2 hover:bg-surface',
                  )}
                  onClick={() => {
                    const first = section.requirements?.[0]
                    if (first) dispatch({ type: 'focus', reqId: first._id })
                  }}
                >
                  <span
                    className={cn(
                      'font-mono text-[11.5px]',
                      inSection ? 'text-accent' : 'text-ink-4',
                    )}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{section.title}</span>
                  <span
                    className="ml-auto flex shrink-0 gap-[3.5px]"
                    aria-label={`${section.title}: ${status}`}
                  >
                    {(section.requirements ?? []).map((r) => {
                      const g = review.grades[r._id]?.grade
                      const focused = r._id === review.focusReqId
                      return (
                        <span
                          key={r._id}
                          className={cn(
                            'h-[5.5px] w-[5.5px] rounded-full',
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
          <div className="flex items-center border-t border-line p-2.5">
            <ThemeToggle />
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {project.gradingSections?.map((section, sectionIndex) => (
            // The gap is what makes the bars read as breaks; without it the
            // tint alone still ran as one continuous ladder of rows.
            <div key={section._id} className={cn(sectionIndex > 0 && 'pt-[18px]')}>
              <SectionHeader
                index={sectionIndex}
                title={section.title}
                total={section.requirements?.length ?? 0}
                graded={
                  (section.requirements ?? []).filter((r) => review.grades[r._id]?.grade).length
                }
              />
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
      <div className="flex shrink-0 items-center gap-5 border-t border-line bg-panel px-6 py-[10px] font-mono text-[12px] text-ink-4 max-rails:gap-3 max-rails:px-4 max-rails:text-[11px]">
        <span className="text-met">
          {tally.met} {GRADES.met.word}
        </span>
        <span className="text-questioned">{tally.questioned} questioned</span>
        <span className="text-needs">{tally.needs} needs work</span>
        <span data-testid="unreviewed-count">{tally.unreviewed} unreviewed</span>
        {tally.exceedsUngraded > 0 && (
          <span data-testid="exceeds-ungraded" className="text-ink-5">
            {tally.exceedsUngraded} exceeds not graded
          </span>
        )}
        <ShortcutsHint className="ml-auto" onClick={openShortcuts} />
      </div>
    </>
  )
}
