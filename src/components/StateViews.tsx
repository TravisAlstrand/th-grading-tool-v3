import { SanityError } from '@/sanity/client'
import { Button, Label } from './primitives'

/**
 * Three states, three different screens.
 *
 * In the 2024 tool a failed fetch showed the loading skeleton forever, and
 * that same skeleton doubled as the empty state — so "still loading",
 * "nothing here" and "the request failed" were indistinguishable.
 */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="flex max-w-[460px] flex-col items-start gap-3">{children}</div>
    </div>
  )
}

export function LoadingState({ label = 'Loading rubrics' }: { label?: string }) {
  return (
    <Frame>
      <Label>{label}…</Label>
      <div className="flex w-[320px] flex-col gap-2" aria-hidden="true">
        {[100, 78, 88, 62].map((w, i) => (
          <div
            key={w}
            className="h-3 animate-pulse rounded-sm bg-surface-2"
            style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    </Frame>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <Frame>
      <Label>Nothing here</Label>
      <p className="m-0 text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="m-0 text-[13px] leading-relaxed text-ink-3">{body}</p>}
    </Frame>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof SanityError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong loading this.'
  const status = error instanceof SanityError ? error.status : null

  return (
    <Frame>
      <Label className="!text-needs">Could not load</Label>
      <p className="m-0 text-[15px] font-semibold text-ink">{message}</p>
      {status !== null && (
        <p className="m-0 font-mono text-[11px] text-ink-4">HTTP {status}</p>
      )}
      <p className="m-0 text-[13px] leading-relaxed text-ink-3">
        Any review you had open is still saved — nothing has been lost.
      </p>
      {onRetry && (
        <Button className="mt-1" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Frame>
  )
}
