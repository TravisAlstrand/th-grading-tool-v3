import { useMemo } from 'react'
import type { ProjectDetail } from '@/sanity/types'
import { buildReview } from '@/review/buildReview'
import { getTemplate } from '@/review/templates'
import type { Review } from '@/review/types'
import { cn } from '@/lib/cn'
import { Kbd, Label } from './primitives'
import { plural } from '@/lib/time'

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

  return (
    <div className="flex w-[372px] shrink-0 flex-col border-l border-line bg-panel max-panel:hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-[18px] pt-3.5 pb-[11px]">
        <Label>{template.name} output</Label>
        <Kbd className="ml-auto">live</Kbd>
      </div>
      <div className="flex-1 overflow-y-auto px-[18px] py-4 font-mono text-[11.5px] leading-[1.85] break-words whitespace-pre-wrap text-[#8C94A0]">
        {lines.map((line, i) => (
          <div
            // Output lines have no identity of their own; they are a
            // rendering of `text`, which is rebuilt whole on every change.
            key={`${i}-${line}`}
            className={cn(
              line.startsWith(template.mark.met) && 'text-met',
              line.startsWith(template.mark.questioned) && 'text-questioned',
              line.startsWith(template.mark.needs) && 'text-needs',
              /^(>|\s{4})/.test(line) && 'text-quote',
            )}
          >
            {line || ' '}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-line px-[18px] py-3">
        <div className="flex gap-1.5">
          <span className="rounded-[5px] bg-surface-2 px-[11px] py-[5px] text-[11.5px] text-ink">
            {template.name}
          </span>
          <span className="self-center font-mono text-[10px] text-ink-4">
            email + plain text land in milestone 2
          </span>
        </div>
        <span className="font-mono text-[10.5px] text-ink-4">
          {unreviewed
            ? `${unreviewed} ${plural(unreviewed, 'requirement')} still unreviewed`
            : 'every requirement reviewed'}
        </span>
      </div>
    </div>
  )
}
