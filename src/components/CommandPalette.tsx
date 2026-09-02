import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTechdegreeIndex } from '@/sanity/hooks'
import { cn } from '@/lib/cn'

type PaletteState = { open: boolean; setOpen: (open: boolean) => void }

const PaletteContext = createContext<PaletteState>({ open: false, setOpen: () => {} })

/** Screens ask this before acting on a keystroke, so the palette always wins. */
export function usePaletteOpen(): boolean {
  return useContext(PaletteContext).open
}

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ open, setOpen }), [open])
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
    </PaletteContext.Provider>
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
  const { open, setOpen } = useContext(PaletteContext)
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
        setOpen(!open)
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
    setOpen(false)
    navigate(`/review/${item.projectId}`)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-scrim pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search projects"
        className="flex max-h-[60vh] w-[min(620px,92vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-pop"
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Search every project…"
          aria-label="Search every project"
          className="border-0 border-b border-line bg-transparent px-[18px] py-[15px] text-[15px] text-ink outline-none placeholder:text-ink-4"
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
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
                  'flex w-full items-center gap-[11px] rounded-[7px] px-3 py-[9px] text-left text-[13.5px] text-ink-2',
                  i === index && 'bg-surface-2 text-ink',
                )}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(item)}
              >
                <span
                  className="h-4 w-[3px] shrink-0 rounded-sm"
                  style={{ background: item.color }}
                />
                <span className="truncate">{item.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-4">
                  {item.meta}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-[22px] text-center text-[13px] text-ink-4">
            {data ? 'No projects match that.' : 'Still loading projects…'}
          </div>
        )}
      </div>
    </div>
  )
}
