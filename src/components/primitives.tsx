import { cn } from '@/lib/cn'

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('keycap', className)}>{children}</kbd>
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('label', className)}>{children}</span>
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3 3 8v8l9 5 9-5V8z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  )
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'held'
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
        'inline-flex items-center gap-[9px] rounded-[7px] border text-[12.5px]',
        'transition-colors duration-100',
        size === 'default' && 'px-[15px] py-2',
        size === 'icon' && 'px-2 py-2',
        variant === 'default' && 'border-edge text-ink-3 hover:bg-surface hover:text-ink-2',
        variant === 'primary' &&
          'border-accent bg-accent font-bold text-on-accent hover:bg-accent-hi [&_kbd]:border-on-accent/25 [&_kbd]:text-on-accent/65',
        variant === 'held' &&
          'border-edge bg-edge font-semibold text-ink-2 hover:bg-edge-2 hover:text-ink',
        className,
      )}
      {...rest}
    />
  )
}
