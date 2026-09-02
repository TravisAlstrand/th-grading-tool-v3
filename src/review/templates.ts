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

export const SLACK_TEMPLATE: Template = {
  id: 'slack',
  name: 'Slack',
  mark: {
    met: ':meets:',
    questioned: ':questioned:',
    needs: ':needs-work:',
    skipped: ':not-attempted:',
  },
  exceeds: ':exceeds: ',
  gap: '',
  quote: (note) =>
    note
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n'),
}

export const TEMPLATES: Record<TemplateId, Template> = {
  slack: SLACK_TEMPLATE,
}

export function getTemplate(id: TemplateId | undefined): Template {
  return (id && TEMPLATES[id]) || SLACK_TEMPLATE
}
