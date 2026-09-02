import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReviewContext } from './ReviewLayout'
import { flatRequirements, sectionStatus } from '@/review/selectors'
import { GRADES, takesNote } from '@/review/grades'
import { useGradingKeys } from '@/review/useGradingKeys'
import type { Grade } from '@/review/types'
import { usePaletteOpen } from '@/components/CommandPalette'
import { OutputPanel } from '@/components/OutputPanel'
import { RequirementRow } from '@/components/RequirementRow'
import { Button, Kbd, Label } from '@/components/primitives'
import { ThemeToggle } from '@/components/Theme'
import { useToast } from '@/components/Toast'
import { ago } from '@/lib/time'
import { cn } from '@/lib/cn'
import { ENTER, chord } from '@/lib/platform'

const DOT: Record<Grade | 'unreviewed', string> = {
  met: 'bg-met',
  questioned: 'bg-questioned',
  needs: 'bg-needs',
  unreviewed: 'bg-edge-2',
}

const SEG: Record<Grade, string> = {
  met: 'bg-met',
  questioned: 'bg-questioned',
  needs: 'bg-needs',
}

/**
 * The section header was `Label`-sized — 11px uppercase against 15px
 * requirement text — so it read as quieter than the rows it was organising.
 * It is now the largest thing in the column, and carries its own progress so
 * you can see where you are in a section without counting rows.
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
    <div className="sticky top-0 z-2 flex items-center gap-3 border-b border-line bg-sechead px-6 pt-[22px] pb-[14px] max-rails:px-4 max-rails:pt-4 max-rails:pb-3">
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
      flash(`Marked ${n} as ${GRADES.met.word}`)
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
        <Button onClick={() => navigate('/')}>← Projects</Button>
        <span className="tdchip" />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[15.5px] font-semibold tracking-[-.01em]">
            {project.title}
          </span>
          <span className="font-mono text-[11.5px] text-ink-4">
            {tdName} · project {String(project.projectNumber ?? 0).padStart(2, '0')}
          </span>
        </div>

        <div className="flex min-w-0 max-w-[590px] flex-1 gap-[3.5px] max-rails:max-w-none">
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
          className={cn('font-mono text-[12px]', saveFailed ? 'text-needs' : 'text-ink-4')}
          data-testid="save-state"
        >
          {saveFailed
            ? 'not saved — storage blocked'
            : savedAt
              ? `saved ${ago(savedAt)}`
              : 'nothing to save yet'}
        </span>

        {/* The rail below carries the toggle; this one covers the widths
            where the rail is hidden. */}
        <ThemeToggle className="rails:hidden" />

        <Button
          onClick={() => {
            if (!tally.unreviewed) {
              flash('Nothing left unreviewed', 'plain')
              return
            }
            const n = tally.unreviewed
            dispatch({ type: 'markRemainingMet' })
            flash(`Marked ${n} as ${GRADES.met.word}`)
          }}
        >
          Mark remaining as {GRADES.met.label.toLowerCase()}
          <Kbd>M</Kbd>
        </Button>

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
            <div key={section._id}>
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
        <span className="ml-auto">
          J K move · 1 2 3 grade · same key clears · E note · M mark rest · {chord('Z')} undo ·{' '}
          {chord('K')} search · {chord(ENTER)} review
        </span>
      </div>
    </>
  )
}
