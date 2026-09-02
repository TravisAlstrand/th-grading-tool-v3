import type { Grade, TemplateId } from './types'

/**
 * The output layer is a template, not a code change — the audit's point was
 * that emoji names and the whole shape of the message were hardcoded. Email
 * and plain text are Milestone 2; the seam is here so adding them is data.
 */
export type Template = {
  id: TemplateId
  name: string
  /** Marker printed before a requirement title. */
  mark: Record<Grade, string>
  /** Marker printed before the title of a requirement flagged as exceeds. */
  exceeds: string
  /** Separator between marker and title. Slack emoji need none. */
  gap: string
  /** How a reviewer's note is quoted under its requirement. */
  quote: (note: string) => string
}

export type NoteSegment = {
  kind: 'prose' | 'code'
  lines: string[]
}

const FENCE = /^\s*```/

/** A one-line ```snippet``` opens and closes itself, so it is not a fence. */
export function isFenceDelimiter(line: string): boolean {
  if (!FENCE.test(line)) return false
  const trimmed = line.trim()
  return !(trimmed.length > 3 && trimmed.endsWith('```'))
}

/**
 * Split a note into runs of prose and runs of fenced code. The delimiters
 * themselves belong to the code run. An unterminated fence runs to the end of
 * the note rather than quietly reverting to prose — a reviewer who opened a
 * fence and forgot to close it meant the rest to be code.
 *
 * Both the Slack output and the two on-screen previews read a note through
 * this, so they cannot disagree about where the code starts.
 */
export function splitFences(note: string): NoteSegment[] {
  const segments: NoteSegment[] = []
  let inFence = false

  const push = (kind: NoteSegment['kind'], line: string) => {
    const last = segments[segments.length - 1]
    if (last?.kind === kind) last.lines.push(line)
    else segments.push({ kind, lines: [line] })
  }

  for (const line of note.split('\n')) {
    if (isFenceDelimiter(line)) {
      push('code', line)
      inFence = !inFence
      continue
    }
    push(inFence ? 'code' : 'prose', line)
  }

  return segments
}

/**
 * Is the caret sitting inside a ``` block? The fence delimiters themselves
 * count as inside, so pressing Tab on the opening line behaves like pressing
 * it on the code below.
 *
 * The note editor uses this to decide whether Tab indents or does its normal
 * job of moving focus — outside a code block, Tab must stay Tab.
 */
export function isInsideFence(text: string, caret: number): boolean {
  const line = text.slice(0, Math.max(0, caret)).split('\n').length - 1
  let seen = 0
  for (const segment of splitFences(text)) {
    seen += segment.lines.length
    if (line < seen) return segment.kind === 'code'
  }
  return false
}

/**
 * Quote a note line by line, but leave fenced code alone. A `> ` inside a
 * Slack code block prints as a literal `>` on every line, so the fence and
 * its contents go out at column 0 and the quote bar breaks around the block.
 */
export function quoteWithFences(note: string): string {
  return splitFences(note)
    .flatMap((segment) =>
      segment.kind === 'code'
        ? segment.lines
        : segment.lines.map((line) => (line.trim() ? `> ${line}` : '>')),
    )
    .join('\n')
}

export const SLACK_TEMPLATE: Template = {
  id: 'slack',
  name: 'Slack',
  mark: {
    met: ':meets:',
    questioned: ':questioned:',
    needs: ':needs-work:',
  },
  exceeds: ':exceeds: ',
  gap: '',
  quote: quoteWithFences,
}

export const TEMPLATES: Record<TemplateId, Template> = {
  slack: SLACK_TEMPLATE,
}

export function getTemplate(id: TemplateId | undefined): Template {
  return (id && TEMPLATES[id]) || SLACK_TEMPLATE
}
