import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTechdegreeIndex } from '@/sanity/hooks'
import { ShortcutSheet } from './Shortcuts'
import { isTypingTarget } from '@/review/useGradingKeys'
import { cn } from '@/lib/cn'

/**
 * The two full-screen overlays share one slot rather than a boolean each.
 * Only one can be open, so ⌘K from the shortcut sheet swaps rather than
 * stacking — and every screen has a single thing to ask before acting on a
 * keystroke, which it would otherwise be easy to add an overlay and forget.
 */
type Overlay = 'palette' | 'shortcuts'
type OverlayState = { open: Overlay | null; setOpen: (open: Overlay | null) => void }

const OverlayContext = createContext<OverlayState>({ open: null, setOpen: () => {} })

/** Screens ask this before acting on a keystroke, so an overlay always wins. */
export function useOverlayOpen(): boolean {
  return useContext(OverlayContext).open !== null
}

/** For the status bars, which offer the sheet to the mouse as well as to `?`. */
export function useOpenShortcuts(): () => void {
  const { setOpen } = useContext(OverlayContext)
  return () => setOpen('shortcuts')
}

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<Overlay | null>(null)
  const value = useMemo(() => ({ open, setOpen }), [open])

  // `?` is a plain character, so it is only a shortcut when nothing is being
  // typed into — including the palette's own search field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      if (e.key === '?') {
        e.preventDefault()
        setOpen(open === 'shortcuts' ? null : 'shortcuts')
        return
      }
      if (e.key === 'Escape' && open === 'shortcuts') {
        e.preventDefault()
        setOpen(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <CommandPalette />
      {open === 'shortcuts' && <ShortcutSheet onClose={() => setOpen(null)} />}
    </OverlayContext.Provider>
  )
}

type Item = {
  projectId: string
  title: string
  meta: string
  color: string
  haystack: string
}

function CommandPalette() {
  const { open: overlay, setOpen } = useContext(OverlayContext)
  const open = overlay === 'palette'
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Cached by TanStack Query — opening the palette costs no extra request.
  const { data } = useTechdegreeIndex()

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const td of data ?? []) {
      for (const project of td.projects ?? []) {
        out.push({
          projectId: project._id,
          title: project.title,
          meta: `${td.abbr ?? td.name} · ${String(project.projectNumber ?? 0).padStart(2, '0')}`,
          color: td.color ?? '#6FD3B4',
          haystack: `${td.name} ${td.abbr ?? ''} ${project.title} ${project.projectNumber ?? ''}`
            .toLowerCase(),
        })
      }
    }
    return out
  }, [data])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.haystack.includes(q))
  }, [items, query])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(open ? null : 'palette')
        setQuery('')
        setIndex(0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index, open])

  if (!open) return null

  const choose = (item: Item | undefined) => {
    if (!item) return
    setOpen(null)
    navigate(`/review/${item.projectId}`)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-scrim pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(null)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search projects"
        className="flex max-h-[60vh] w-[min(682px,92vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-pop"
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Search every project…"
          aria-label="Search every project"
          className="border-0 border-b border-line bg-transparent px-[20px] py-[16.5px] text-[16.5px] text-ink outline-none placeholder:text-ink-4"
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(null)
              return
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const delta = e.key === 'ArrowDown' ? 1 : -1
              setIndex((i) => Math.max(0, Math.min(results.length - 1, i + delta)))
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              choose(results[index])
            }
          }}
        />
        {results.length ? (
          <div ref={listRef} className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
            {results.map((item, i) => (
              <button
                key={item.projectId}
                type="button"
                data-active={String(i === index)}
                className={cn(
                  'flex w-full items-center gap-[12px] rounded-[7.5px] px-3 py-[10px] text-left text-[15px] text-ink-2',
                  i === index && 'bg-surface-2 text-ink',
                )}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(item)}
              >
                <span
                  className="h-4 w-[3.5px] shrink-0 rounded-sm"
                  style={{ background: item.color }}
                />
                <span className="truncate">{item.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[12px] text-ink-4">
                  {item.meta}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-[24px] text-center text-[14.5px] text-ink-4">
            {data ? 'No projects match that.' : 'Still loading projects…'}
          </div>
        )}
      </div>
    </div>
  )
}
