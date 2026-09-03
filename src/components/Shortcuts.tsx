import { Kbd } from './primitives'
import { ENTER, chord } from '@/lib/platform'

/**
 * The status bar used to print all nine grading shortcuts on every screen.
 * They never change, so it was documentation pinned permanently to the UI —
 * and below 1298px it wrapped onto a second line and took a row of the
 * rubric with it. It lives here instead, one `?` away.
 *
 * `?` rather than another chord: it is the convention everywhere else that
 * has a shortcut sheet, it needs no modifier to spell, and the app has
 * already spent ⌘K, ⌘Z and ⌘↵ — a fourth chord to memorise is a strange
 * thing to guard a list of chords with.
 */
type Group = { title: string; rows: [keys: string[], what: string][] }

export const SHORTCUT_GROUPS: Group[] = [
  {
    title: 'Grading',
    rows: [
      [['J', 'K'], 'Move between requirements (↑ ↓ work too)'],
      // One row, not two: a lone `1` against "clears the grade" read as if 1
      // were the clear key rather than the second press of whichever you used.
      [['1', '2', '3'], 'Passed · Questionable · Needs work — press the same number again to clear'],
      [['E'], 'Write feedback on the focused requirement'],
      [['M'], 'Mark every remaining required requirement as passed'],
      [['X'], 'Mark every ungraded exceeds requirement as passed'],
      [[chord('Z')], 'Undo the last change'],
      [[chord(ENTER)], 'Go to review & send'],
      [['Esc'], 'Back to the projects list'],
    ],
  },
  {
    title: 'Writing feedback',
    rows: [
      [[chord(ENTER)], 'Save and move to the next requirement'],
      [['Esc'], 'Leave the field'],
      [['Tab'], 'Indent — but only inside a ``` block'],
    ],
  },
  {
    title: 'Projects list',
    rows: [
      [['J', 'K'], 'Move through techdegrees and projects'],
      [[ENTER], 'Open'],
      [['Esc'], 'Back to the techdegree that opened them'],
    ],
  },
  {
    title: 'Review & send',
    rows: [
      [[chord(ENTER)], 'Copy the review'],
      [['Esc'], 'Back to grading'],
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      [[chord('K')], 'Search every project'],
      [['?'], 'This list'],
    ],
  },
]

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-scrim pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        data-testid="shortcuts"
        className="flex max-h-[76vh] w-[min(660px,92vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-line px-[20px] py-[14.5px]">
          <span className="text-[16.5px] font-semibold text-ink">Keyboard shortcuts</span>
          <Kbd className="ml-auto">Esc</Kbd>
        </div>
        <div className="flex flex-col gap-[18px] overflow-y-auto px-[20px] py-[18px]">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1.5">
              <span className="label">{group.title}</span>
              {group.rows.map(([keys, what]) => (
                <div
                  key={what}
                  className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-4"
                >
                  <span className="flex flex-wrap gap-[3.5px]">
                    {keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                  <span className="text-[14.5px] leading-[1.5] text-ink-2">{what}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
