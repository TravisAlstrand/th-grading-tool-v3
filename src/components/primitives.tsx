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
}

export function Button({ variant = 'default', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-[9px] rounded-[7px] border px-[15px] py-2 text-[12.5px]',
        'transition-colors duration-100',
        variant === 'default' && 'border-edge text-ink-3 hover:bg-surface hover:text-ink-2',
        variant === 'primary' &&
          'border-accent bg-accent font-bold text-bg hover:bg-accent-hi [&_kbd]:border-bg/25 [&_kbd]:text-bg/65',
        variant === 'held' &&
          'border-edge bg-edge font-semibold text-ink-2 hover:bg-edge-2 hover:text-ink',
        className,
      )}
      {...rest}
    />
  )
}
