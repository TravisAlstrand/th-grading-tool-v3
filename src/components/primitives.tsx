import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import logoUrl from '@/assets/treehouse-logo.png'

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('keycap', className)}>{children}</kbd>
}

/**
 * All the status bars say about the keyboard now, in place of the cheat
 * sheet they used to print. A button, not a caption — what it opens should
 * be reachable without already knowing the key that opens it.
 */
export function KeyHint({
  keyLabel,
  label,
  testId,
  className,
  onClick,
}: {
  keyLabel: string
  label: string
  testId: string
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-2 rounded-[5.5px] px-1.5 py-0.5',
        'text-ink-4 hover:text-ink-2 [&:hover_kbd]:border-edge-2 [&:hover_kbd]:text-ink-2',
        className,
      )}
      onClick={onClick}
    >
      <Kbd>{keyLabel}</Kbd>
      {label}
    </button>
  )
}

function HomeIcon() {
  return (
    <svg
      width="16.5"
      height="16.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.8V20h13V9.8" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  )
}

/**
 * Leaving is not the same as discarding, and the send screen only offered
 * the destructive one: `Close review` throws the draft away, and the only
 * other way out was back to the rubric and then out again. The draft is
 * written to storage on every change, so this just navigates — the review is
 * waiting under "Unfinished reviews" when you come back.
 */
export function HomeButton({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <Button
      size="icon"
      className={className}
      onClick={onClick}
      aria-label="Back to projects"
      title="Back to projects — this draft stays saved"
      data-testid="home-button"
    >
      <HomeIcon />
    </Button>
  )
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('label', className)}>{children}</span>
}

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      width="22"
      height="22"
      alt=""
      aria-hidden="true"
      className={cn('shrink-0', className)}
    />
  )
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'held' | 'danger' | 'nav'
  /** `icon` squares the padding for a single glyph. `cn` does not merge
   *  Tailwind classes, so padding has to be chosen here rather than
   *  overridden from the outside. */
  size?: 'default' | 'icon'
}

export function Button({ variant = 'default', size = 'default', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-[10px] rounded-[7.5px] border text-[14px]',
        'transition-colors duration-100',
        size === 'default' && 'px-[16.5px] py-2',
        size === 'icon' && 'px-2 py-2',
        variant === 'default' && 'border-edge text-ink-3 hover:bg-surface hover:text-ink-2',
        variant === 'primary' &&
          'border-accent bg-accent font-bold text-on-accent hover:bg-accent-hi [&_kbd]:border-on-accent/25 [&_kbd]:text-on-accent/65',
        variant === 'held' &&
          'border-edge bg-edge font-semibold text-ink-2 hover:bg-edge-2 hover:text-ink',
        // Filled, like primary — it discards the draft, so it should look
        // like it means it.
        variant === 'danger' &&
          'border-needs bg-needs font-bold text-on-accent hover:bg-needs-ink [&_kbd]:border-on-accent/25 [&_kbd]:text-on-accent/65',
        // Outlined rather than filled: going back is not a commit, and a
        // third solid button would compete with copy and close.
        variant === 'nav' && 'border-nav font-semibold text-nav hover:bg-nav/10 hover:text-nav-hi',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * A destructive action that asks first, in the page rather than in a browser
 * dialog. `window.confirm` looks reliable and is not: once a viewer ticks
 * Chrome's "prevent this page from creating additional dialogs" — which it
 * offers after a few dialogs in a row — confirm() silently returns false for
 * the rest of the page's life, and the button appears broken with no
 * feedback at all. This cannot be suppressed.
 *
 * First press arms it, second press commits. It disarms on blur, and after a
 * few seconds, so a stray click never leaves a live destructive button under
 * the cursor.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel,
  children,
  ...rest
}: Omit<ButtonProps, 'onClick'> & { onConfirm: () => void; confirmLabel: string }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <Button
      {...rest}
      aria-live="polite"
      data-armed={String(armed)}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        onConfirm()
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  )
}
