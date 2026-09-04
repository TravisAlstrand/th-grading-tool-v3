import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReviewContext } from './ReviewLayout'
import { buildReview } from '@/review/buildReview'
import { GRADES, GRADE_ORDER } from '@/review/grades'
import { getTemplate, isFenceDelimiter, splitFences } from '@/review/templates'
import type { Grade } from '@/review/types'
import { useOverlayOpen } from '@/components/Overlays'
import { isTypingTarget } from '@/review/useGradingKeys'
import { Button, ConfirmButton, HomeButton, Kbd, Label } from '@/components/primitives'
import { ThemeToggle } from '@/components/Theme'
import { useToast } from '@/components/Toast'
import { copyText } from '@/lib/clipboard'
import { ago, plural } from '@/lib/time'
import { cn } from '@/lib/cn'
import { ENTER, chord } from '@/lib/platform'

/** Reading order for a student: what to fix first, what passed last. */
const GROUP_ORDER: Grade[] = ['needs', 'questioned', 'met']

const GROUP_DOT: Record<Grade, string> = {
  met: 'bg-met',
  questioned: 'bg-questioned',
  needs: 'bg-needs',
}

const GROUP_EDGE: Record<Grade, string> = {
  met: 'border-l-[3.5px] border-l-met',
  questioned: 'border-l-[3.5px] border-l-questioned',
  needs: 'border-l-[3.5px] border-l-needs',
}

/**
 * Slack draws the fence itself, but it has no language hints — a ```js fence
 * shows a stray "js" as the block's first line. The preview shows that too;
 * it is the output, not a tidied version of it.
 */
function codeBody(lines: string[]): string {
  const out: string[] = []
  for (const line of lines) {
    if (isFenceDelimiter(line)) {
      const rest = line.trim().slice(3)
      if (rest) out.push(rest)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/** A note as Slack draws it: a quote bar on the prose, a plain box on code. */
function NotePreview({ note }: { note: string }) {
  return (
    <div className="flex flex-col gap-1">
      {splitFences(note).map((segment, i) =>
        segment.kind === 'code' ? (
          <div
            key={i}
            className="rounded-md border border-edge bg-editor px-[12px] py-1.5 font-mono text-[12.5px] whitespace-pre-wrap text-ink-2"
          >
            {codeBody(segment.lines)}
          </div>
        ) : (
          <div
            key={i}
            className="border-l-[3.5px] border-edge-2 pl-[12px] text-[14px] whitespace-pre-wrap text-ink-2"
          >
            {segment.lines.join('\n')}
          </div>
        ),
      )}
    </div>
  )
}

const GLYPH: Record<Grade, string> = { met: '✓', questioned: '?', needs: '✕' }
const GLYPH_INK: Record<Grade, string> = {
  met: 'text-met',
  questioned: 'text-questioned',
  needs: 'text-needs',
}

export function Send() {
  const { project, session } = useReviewContext()
  const { review, tally, dispatch, savedAt, discard } = session
  const navigate = useNavigate()
  const flash = useToast()
  const overlayOpen = useOverlayOpen()

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { text, groups } = useMemo(() => buildReview(review, project), [review, project])

  // This preview redraws the message from `groups` rather than printing
  // `text`, so that :meets: can show as a tick the way Slack renders it. That
  // freedom is also how it can quietly disagree with what the student gets —
  // it missed the rule before the closing line. The condition is read back
  // out of the built text rather than reimplemented here.
  const rule = getTemplate(review.template).divider
  const showsRule = Boolean(rule) && text.includes(rule)

  const copy = async () => {
    if (tally.unreviewed) {
      flash(
        `${tally.unreviewed} ${plural(tally.unreviewed, 'requirement')} still unreviewed`,
        'plain',
      )
      navigate(`/review/${project._id}`)
      return
    }
    const ok = await copyText(text)
    flash(
      ok ? 'Review copied' : 'Copy failed; select the preview text instead',
      ok ? 'ok' : 'plain',
    )
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (overlayOpen) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void copy()
        return
      }
      if (e.key === 'Escape') {
        if (isTypingTarget(e.target)) {
          e.preventDefault()
          if (e.target instanceof HTMLElement) e.target.blur()
          return
        }
        e.preventDefault()
        navigate(`/review/${project._id}`)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  const closeReview = () => {
    discard()
    navigate('/')
    flash('Review closed')
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-[20px] border-b border-line bg-panel px-6 py-3 max-rails:gap-3 max-rails:px-4 max-rails:py-2.5">
        <Button variant="nav" onClick={() => navigate(`/review/${project._id}`)}>
          ← Back to rubric
        </Button>
        <span className="tdchip" />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="text-[15.5px] font-semibold">Review &amp; send</span>
          <span className="truncate font-mono text-[11.5px] text-ink-4">
            {project.title} · {tally.reviewed} of {tally.total} reviewed
          </span>
        </div>
        <span
          className={cn(
            'ml-auto font-mono text-[12px]',
            tally.unreviewed ? 'text-questioned' : 'text-accent',
          )}
        >
          {tally.unreviewed ? `${tally.unreviewed} unreviewed` : 'nothing unreviewed'}
        </span>
        <HomeButton onClick={() => navigate('/')} />
        <ThemeToggle />
        <Button variant={tally.unreviewed ? 'held' : 'primary'} onClick={() => void copy()}>
          Copy to clipboard
          <Kbd>{chord(ENTER)}</Kbd>
        </Button>
        <ConfirmButton variant="danger" confirmLabel="Close and discard?" onConfirm={closeReview}>
          Close review
        </ConfirmButton>
      </div>

      <div className="flex min-h-0 flex-1 max-rails:flex-col">
        {/* Editable review */}
        <div className="flex min-w-0 flex-1 flex-col gap-[24px] overflow-y-auto px-8 py-6 max-rails:px-4">
          <div className="flex flex-col gap-[10px]">
            <Label>Opening line</Label>
            <textarea
              rows={2}
              value={review.opening}
              aria-label="Opening line"
              className="w-full resize-y rounded-lg border border-edge bg-surface px-[16.5px] py-[12px] font-sans text-[15px] leading-[1.6] text-ink-2 outline-none focus:border-accent"
              onChange={(e) => dispatch({ type: 'setOpening', value: e.target.value })}
            />
          </div>

          {GROUP_ORDER.map((grade) => {
            const items = groups[grade]
            if (!items.length) return null
            // Closed to start: the counts are the summary, and the opening and
            // closing lines are what you are actually here to edit. The full
            // review is on the right either way.
            const open = Boolean(expanded[grade])

            return (
              <div key={grade} className="flex flex-col gap-[12px]">
                <button
                  type="button"
                  aria-expanded={open}
                  data-testid={`group-${grade}`}
                  className="flex items-center gap-2.5 rounded-lg border border-edge-3 bg-surface px-4 py-[12px] text-left text-[14.5px] font-bold hover:border-edge-2"
                  onClick={() => setExpanded((e) => ({ ...e, [grade]: !open }))}
                >
                  <span className={cn('h-[7.5px] w-[7.5px] rounded-full', GROUP_DOT[grade])} />
                  <span>{GRADES[grade].label}</span>
                  <span className="font-mono text-[14px] font-normal text-ink-2">
                    {items.length}
                  </span>
                  <span className="ml-auto font-mono text-[11.5px] font-normal text-accent">
                    {open ? 'Collapse' : 'Expand'}
                  </span>
                </button>

                {open &&
                  items.map(({ req, note }) => (
                    <div
                      key={req._id}
                      className={cn(
                        'flex flex-col gap-[7.5px] rounded-lg border border-edge-3 bg-surface px-4 py-[14.5px]',
                        GROUP_EDGE[grade],
                      )}
                    >
                      <span className="text-[15px] font-semibold">
                        {req.isExceeds && <span className="text-exceeds">★ </span>}
                        {req.title}
                      </span>
                      {note && (
                        <span className="text-[14.5px] leading-[1.6] whitespace-pre-wrap text-ink-2">
                          {note}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )
          })}

          <div className="flex flex-col gap-[10px]">
            <Label>Closing line</Label>
            <textarea
              rows={2}
              value={review.closing}
              aria-label="Closing line"
              className="w-full resize-y rounded-lg border border-edge bg-surface px-[16.5px] py-[12px] font-sans text-[15px] leading-[1.6] text-ink-2 outline-none focus:border-accent"
              onChange={(e) => dispatch({ type: 'setClosing', value: e.target.value })}
            />
          </div>
        </div>

        {/* Slack preview */}
        <div className="flex w-[572px] min-h-0 shrink-0 flex-col border-l border-line bg-panel max-rails:w-auto max-rails:flex-1 max-rails:border-t max-rails:border-l-0">
          <div className="flex items-center gap-2.5 border-b border-line px-[20px] pt-3.5 pb-[12px]">
            <Label>Slack preview</Label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-[20px]">
            <div className="overflow-hidden rounded-[11px] border border-edge bg-surface">
              <div className="flex items-center gap-[10px] border-b border-line bg-editor-foot px-4 py-2.5 text-[14px] text-ink-2">
                <span className="font-mono">#</span>
                <span>reviews</span>
                <Kbd className="ml-auto">preview</Kbd>
              </div>
              <div className="flex gap-[12px] p-4">
                <div className="grid h-[37.5px] w-[37.5px] shrink-0 place-items-center rounded-lg bg-[var(--td)] text-[13px] font-bold text-on-brand">
                  {(project.techdegree?.abbr ?? 'TD').slice(0, 2)}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-[14.5px] leading-[1.55] text-ink">
                  <div className="flex items-baseline gap-2">
                    <b className="text-[14.5px]">Reviewer</b>
                    <span className="text-[12px] text-ink-4">now</span>
                  </div>
                  {review.opening.trim() && <span>{review.opening.trim()}</span>}
                  {GRADE_ORDER.map((grade) => {
                    const items = groups[grade]
                    if (!items.length) return null
                    return (
                      <div key={grade} className="mt-1 flex flex-col gap-[3.5px]">
                        {items.map(({ req, note }) => (
                          <div key={req._id}>
                            <span>
                              <span className={GLYPH_INK[grade]}>{GLYPH[grade]} </span>
                              {req.isExceeds ? '★ ' : ''}
                              {req.title}
                            </span>
                            {note && <NotePreview note={note} />}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {showsRule && (
                    <span
                      aria-hidden="true"
                      data-testid="preview-rule"
                      className="mt-2.5 truncate text-quote select-none"
                    >
                      {rule}
                    </span>
                  )}
                  {review.closing.trim() && (
                    <span className={showsRule ? 'mt-1' : 'mt-2.5'}>{review.closing.trim()}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-line px-[20px] py-3 font-mono text-[11.5px] text-ink-4">
            {text.split('\n').length} lines · {text.length} characters
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-5 border-t border-line bg-panel px-6 py-[10px] font-mono text-[12px] text-ink-4 max-rails:px-4">
        <span>copying keeps the review open — it does not reset the app</span>
        <span className="ml-auto">
          {savedAt ? `draft saved ${ago(savedAt)}` : 'draft not saved'}
        </span>
      </div>
    </>
  )
}
