import { describe, expect, it } from 'vitest'
import { parseDraft } from './storage'
import { DEFAULT_CLOSING, DEFAULT_OPENING } from './grades'

/**
 * Every draft in a reviewer's browser was written by an older build. Reading
 * one has to fill in whatever that build did not know about, and never throw
 * away a review because a field it has never heard of is missing.
 */
const saved = (extra: Record<string, unknown> = {}) => ({
  projectId: 'p1',
  grades: { r1: { grade: 'met', note: '' } },
  ...extra,
})

describe('parseDraft', () => {
  it('defaults the rule to on for drafts saved before the toggle existed', () => {
    // Those drafts were written when the rule was unconditional, so absent
    // has to mean on — reading it as off would silently change their output.
    expect(parseDraft(saved())?.divider).toBe(true)
    expect(parseDraft(saved({ divider: undefined }))?.divider).toBe(true)
  })

  it('keeps an explicit choice either way', () => {
    expect(parseDraft(saved({ divider: false }))?.divider).toBe(false)
    expect(parseDraft(saved({ divider: true }))?.divider).toBe(true)
  })

  it('ignores a non-boolean rather than trusting it', () => {
    expect(parseDraft(saved({ divider: 'yes' }))?.divider).toBe(true)
  })

  it('still fills in the other lines it has always filled in', () => {
    const draft = parseDraft(saved())
    expect(draft?.opening).toBe(DEFAULT_OPENING)
    expect(draft?.closing).toBe(DEFAULT_CLOSING)
  })

  it('treats a draft with no project id as absent instead of crashing', () => {
    expect(parseDraft({ grades: {} })).toBeNull()
    expect(parseDraft(null)).toBeNull()
  })
})
