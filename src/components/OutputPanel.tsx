import { useMemo } from 'react'
import type { ProjectDetail } from '@/sanity/types'
import { buildReview } from '@/review/buildReview'
import { getTemplate, isFenceDelimiter, type Template } from '@/review/templates'
import { GRADE_ORDER } from '@/review/grades'
import type { Review } from '@/review/types'
import { cn } from '@/lib/cn'
import { Kbd, Label } from './primitives'
import { plural } from '@/lib/time'

type LineKind = 'met' | 'questioned' | 'needs' | 'quote' | 'code' | 'plain'

const KIND_CLASS: Record<LineKind, string> = {
  met: 'text-met',
  questioned: 'text-questioned',
  needs: 'text-needs',
  quote: 'text-quote',
  code: 'bg-editor px-1.5 text-quote',
  plain: '',
}

/**
 * One pass, carrying fence state — a `> ` test per line cannot tell a quoted
 * note from the code block sitting inside one.
 */
function classifyLines(lines: string[], template: Template): LineKind[] {
  let inFence = false
  return lines.map((line) => {
    const grade = GRADE_ORDER.find((g) => line.startsWith(template.mark[g]))
    if (grade) {
      // A requirement line ends a fence the reviewer never closed.
      inFence = false
      return grade
    }
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      return 'code'
    }
    if (inFence) return 'code'
    return /^(>|\s{4})/.test(line) ? 'quote' : 'plain'
  })
}

/**
 * The Slack message as it is being written. Not a summary of the review —
 * the actual output of `buildReview()`, so what you read here is what the
 * student gets.
 */
export function OutputPanel({
  review,
  project,
  unreviewed,
}: {
  review: Review
  project: ProjectDetail
  unreviewed: number
}) {
  const template = getTemplate(review.template)
  const { text } = useMemo(() => buildReview(review, project), [review, project])

  const lines = text.split('\n')
  const kinds = classifyLines(lines, template)

  return (
    <div className="flex w-[409px] shrink-0 flex-col border-l border-line bg-panel max-panel:hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-[20px] pt-3.5 pb-[12px]">
        <Label>{template.name} output</Label>
        <Kbd className="ml-auto">live</Kbd>
      </div>
      <div className="flex-1 overflow-y-auto px-[20px] py-4 font-mono text-[12.5px] leading-[1.85] break-words whitespace-pre-wrap text-ink-3">
        {lines.map((line, i) => (
          <div
            // Output lines have no identity of their own; they are a
            // rendering of `text`, which is rebuilt whole on every change.
            key={`${i}-${line}`}
            className={cn(KIND_CLASS[kinds[i] ?? 'plain'])}
          >
            {line || ' '}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-line px-[20px] py-3">
        <div className="flex gap-1.5">
          <span className="rounded-[5.5px] bg-surface-2 px-[12px] py-[5.5px] text-[12.5px] text-ink">
            {template.name}
          </span>
          <span className="self-center font-mono text-[11px] text-ink-4">
            email + plain text land in milestone 2
          </span>
        </div>
        <span className="font-mono text-[11.5px] text-ink-4">
          {unreviewed
            ? `${unreviewed} ${plural(unreviewed, 'requirement')} still unreviewed`
            : 'every requirement reviewed'}
        </span>
      </div>
    </div>
  )
}
