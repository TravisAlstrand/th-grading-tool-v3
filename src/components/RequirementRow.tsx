import { forwardRef } from 'react'
import type { Requirement } from '@/sanity/types'
import { GRADES, GRADE_ORDER, takesNote } from '@/review/grades'
import type { Grade, GradeEntry } from '@/review/types'
import { cn } from '@/lib/cn'

const STRIPE: Record<Grade, string> = {
  met: 'bg-met',
  questioned: 'bg-questioned',
  needs: 'bg-needs',
  skipped: 'bg-edge-2 opacity-50',
}

const STATE_INK: Record<Grade, string> = {
  met: 'text-met',
  questioned: 'text-questioned',
  needs: 'text-needs',
  skipped: 'text-ink-4',
}

const PRESSED: Record<Grade, string> = {
  met: 'aria-pressed:border-met aria-pressed:bg-met-bg aria-pressed:text-met-ink',
  questioned: 'aria-pressed:border-questioned aria-pressed:text-questioned-ink',
  needs: 'aria-pressed:border-needs aria-pressed:bg-needs-bg aria-pressed:text-needs-ink',
  skipped: 'aria-pressed:border-edge-2 aria-pressed:bg-surface aria-pressed:text-ink-2',
}

export type RequirementRowProps = {
  req: Requirement
  entry: GradeEntry | undefined
  focused: boolean
  onFocus: () => void
  onGrade: (grade: Grade) => void
  onNoteChange: (note: string) => void
  editorRef: React.RefObject<HTMLTextAreaElement>
}

export const RequirementRow = forwardRef<HTMLDivElement, RequirementRowProps>(
  function RequirementRow(
    { req, entry, focused, onFocus, onGrade, onNoteChange, editorRef },
    ref,
  ) {
    const grade = entry?.grade

    return (
      <div
        ref={ref}
        data-testid="requirement"
        data-req-id={req._id}
        data-grade={grade ?? 'none'}
        data-focused={String(focused)}
        className={cn(
          'grid grid-cols-[4px_minmax(0,1fr)] border-b border-line-soft',
          focused && 'bg-raised',
        )}
        onClick={(e) => {
          if (focused) return
          if (e.target instanceof HTMLElement && e.target.closest('button, textarea')) return
          onFocus()
        }}
      >
        <span className={cn(focused ? 'bg-ink' : grade ? STRIPE[grade] : 'bg-edge-2')} />

        <div className="min-w-0 px-6 pt-3 pb-[13px] pl-4 max-rails:px-4 max-rails:pl-3">
          <div className="flex items-baseline gap-2.5">
            <span
              className={cn(
                'text-[14px] leading-[1.45]',
                focused ? 'text-[15px] font-semibold text-ink' : 'text-ink-2',
              )}
            >
              {req.title}
            </span>
            {req.isExceeds && (
              <span className="shrink-0 rounded-[3px] bg-exceeds-bg px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[.1em] text-exceeds">
                EXCEEDS
              </span>
            )}
            <span
              className={cn(
                'ml-auto shrink-0 font-mono text-[10.5px]',
                grade ? STATE_INK[grade] : 'text-ink-4',
              )}
            >
              {grade ? GRADES[grade].word : 'unreviewed'}
            </span>
          </div>

          {/* Rendered when Sanity has one. Every requirement in the dataset
              today has description: null, so this is usually silent. */}
          {focused && req.description && (
            <p className="mt-1.5 mb-0 max-w-[76ch] text-[13px] leading-[1.55] text-ink-3">
              {req.description}
            </p>
          )}

          {!focused && entry?.note && (
            <p className="mt-[7px] mb-0 max-w-[76ch] border-l-2 border-edge pl-[11px] text-[12.5px] leading-[1.5] whitespace-pre-wrap text-ink-3">
              {entry.note}
            </p>
          )}

          {focused && (
            <div className="mt-3 flex flex-wrap gap-[7px]">
              {GRADE_ORDER.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={grade === g}
                  aria-label={`${GRADES[g].label} — ${req.title}`}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md border border-edge px-[13px] py-[7px] text-[12.5px] text-ink-3',
                    'hover:border-edge-2 hover:text-ink-2 aria-pressed:font-semibold',
                    g === 'skipped' ? 'border-dashed bg-transparent' : 'bg-surface',
                    PRESSED[g],
                  )}
                  onClick={() => onGrade(g)}
                >
                  <kbd className="keycap border-transparent p-0">{GRADES[g].key}</kbd>
                  {GRADES[g].label}
                </button>
              ))}
            </div>
          )}

          {focused && takesNote(grade) && entry && (
            <div className="mt-3 max-w-[860px] overflow-hidden rounded-lg border border-edge-3 bg-editor">
              <textarea
                ref={editorRef}
                rows={3}
                value={entry.note}
                aria-label={`Feedback for ${req.title}`}
                placeholder="What should the student change? This becomes the quoted note under the requirement."
                className="block min-h-[76px] w-full resize-y border-0 bg-transparent px-[15px] py-3 font-sans text-[13.5px] leading-[1.6] text-ink outline-none placeholder:text-ink-5"
                onChange={(e) => onNoteChange(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3 border-t border-line bg-editor-foot px-[15px] py-2 text-[12px] text-ink-4">
                <span className="font-mono text-[10px]">⌘↵ save &amp; next</span>
                <span className="ml-auto font-mono text-[10px]">Esc leaves the field</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  },
)
