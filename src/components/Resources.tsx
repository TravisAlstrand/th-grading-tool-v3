import { useEffect, useRef } from 'react'
import type { ProjectDetail } from '@/sanity/types'
import { PINNED_LINKS } from '@/lib/links'
import { Kbd } from './primitives'
import { moveFocusBy, visibleNavItems } from '@/lib/navList'

/**
 * Everything a reviewer might need to open mid-review, on one key.
 *
 * Four sources, and the panel is honest about which is which: the study
 * guide and the mockups belong to this project, the validators are global
 * `resource` documents in Sanity, and the pinned links are compiled in.
 *
 * Almost every group is usually absent — 16 of 65 projects have a study
 * guide, 7 have any mockup at all, and only 3 have all three breakpoints. So
 * an empty group is the normal case, not the edge case, and is dropped
 * rather than rendered as a heading with nothing under it.
 */
type Group = { title: string; note?: string; links: { key: string; title: string; description: string | null; href: string }[] }

export function groupsFor(project: ProjectDetail): Group[] {
  const groups: Group[] = []

  if (project.studyGuide) {
    groups.push({
      title: 'Study guide',
      links: [
        {
          key: 'study-guide',
          // The heading already says "study guide", so the row names the
          // project instead of repeating it.
          title: project.title,
          // No invented description: across the 16 projects that have one,
          // studyGuide is variously a Treehouse library page, an S3 PDF and a
          // Drive link, so any sentence naming the destination would be wrong
          // some of the time. The URL under it says where it goes.
          description: null,
          href: project.studyGuide,
        },
      ],
    })
  }

  // Three separate nullable fields rather than an array, so the subset is
  // whatever the project happens to carry. Ordered small to large, which is
  // the order the mockups are designed in.
  const mockups = (
    [
      ['Mobile mockup', project.mobileMockup],
      ['Tablet mockup', project.tabletMockup],
      ['Desktop mockup', project.desktopMockup],
    ] as const
  ).filter(([, href]) => Boolean(href))

  if (mockups.length) {
    groups.push({
      title: mockups.length === 1 ? 'Mockup' : 'Mockups',
      links: mockups.map(([title, href]) => ({
        key: title,
        title,
        description: null,
        href: href as string,
      })),
    })
  }

  if (project.resources?.length) {
    groups.push({
      title: 'Validators',
      links: project.resources.map((r) => ({
        key: r._id,
        title: r.title,
        description: r.description,
        href: r.link,
      })),
    })
  }

  if (PINNED_LINKS.length) {
    groups.push({
      title: 'Pinned',
      links: PINNED_LINKS.map((l) => ({
        key: l.href,
        title: l.title,
        description: l.description ?? null,
        href: l.href,
      })),
    })
  }

  return groups
}

export function ResourcePanel({
  project,
  onClose,
}: {
  project: ProjectDetail
  onClose: () => void
}) {
  const groups = groupsFor(project)
  const panelRef = useRef<HTMLDivElement>(null)

  // Opening put focus nowhere, so reaching the first link meant tabbing past
  // whatever was behind the dialog. Focus the first link, and put focus back
  // where it came from on close.
  useEffect(() => {
    const previous = document.activeElement
    const panel = panelRef.current
    if (panel) visibleNavItems('[data-nav-item]', panel)[0]?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  // J/K move the same way they do everywhere else. Tab is taken too: the
  // dialog claims `aria-modal`, so Tab has no business walking out of it
  // into the grading screen underneath. Tab wraps, J/K clamp.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current
      if (!panel || e.metaKey || e.ctrlKey || e.altKey) return
      const items = visibleNavItems('[data-nav-item]', panel)
      if (!items.length) return

      if (e.key === 'Tab') {
        e.preventDefault()
        moveFocusBy(items, e.shiftKey ? -1 : 1, true)
        return
      }
      const down = e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown'
      const up = e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp'
      if (!down && !up) return
      e.preventDefault()
      moveFocusBy(items, down ? 1 : -1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-scrim pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Resources"
        data-testid="resources"
        className="flex max-h-[76vh] w-[min(660px,92vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-line px-[20px] py-[14.5px]">
          <span className="text-[16.5px] font-semibold text-ink">Resources</span>
          <Kbd className="ml-auto">Esc</Kbd>
        </div>

        {groups.length ? (
          <div className="flex flex-col gap-[18px] overflow-y-auto px-[20px] py-[18px]">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1.5">
                <span className="label">{group.title}</span>
                {group.links.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-nav-item=""
                    data-testid="resource-link"
                    className="flex flex-col gap-0.5 rounded-[7.5px] border border-edge px-[14.5px] py-[10px] no-underline hover:border-edge-2 hover:bg-surface"
                  >
                    <span className="flex items-baseline gap-2.5">
                      <span className="text-[15px] font-semibold text-ink">{link.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-4">
                        opens in a new tab ↗
                      </span>
                    </span>
                    {link.description && (
                      <span className="text-[14px] leading-[1.5] text-ink-3">
                        {link.description}
                      </span>
                    )}
                    <span className="truncate font-mono text-[11.5px] text-ink-5">{link.href}</span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-[20px] py-[28px] text-center text-[14.5px] text-ink-4">
            Nothing linked for {project.title} yet.
          </div>
        )}
      </div>
    </div>
  )
}
