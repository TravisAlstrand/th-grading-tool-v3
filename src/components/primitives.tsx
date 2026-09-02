import { cn } from '@/lib/cn'
import logoUrl from '@/assets/treehouse-logo.png'

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('keycap', className)}>{children}</kbd>
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
        'inline-flex items-center gap-[10px] rounded-[7.5px] border text-[14px]',
        'transition-colors duration-100',
        size === 'default' && 'px-[16.5px] py-2',
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
