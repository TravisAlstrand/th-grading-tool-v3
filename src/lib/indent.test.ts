import { describe, expect, it } from 'vitest'
import { INDENT, reindent } from './indent'
import { isInsideFence } from '@/review/templates'

/**
 * Tab is only taken inside a fence, so the boundary between "indent" and
 * "move focus" is the thing worth pinning down.
 */

const note = [
  'Two of these are still var:', // line 0
  '```js', //                       line 1
  'var total = items.length', //    line 2
  '```', //                         line 3
  'Same in the loop below.', //     line 4
].join('\n')

const caretOnLine = (text: string, line: number) => {
  const lines = text.split('\n')
  return lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0)
}

describe('isInsideFence', () => {
  it('is false in the prose above and below the block', () => {
    expect(isInsideFence(note, caretOnLine(note, 0))).toBe(false)
    expect(isInsideFence(note, caretOnLine(note, 4))).toBe(false)
  })

  it('is true on the code and on both fence lines', () => {
    expect(isInsideFence(note, caretOnLine(note, 1))).toBe(true)
    expect(isInsideFence(note, caretOnLine(note, 2))).toBe(true)
    expect(isInsideFence(note, caretOnLine(note, 3))).toBe(true)
  })

  it('is false in a note with no fences at all', () => {
    const plain = 'Only three phrases.\nAdd two more.'
    expect(isInsideFence(plain, 0)).toBe(false)
    expect(isInsideFence(plain, plain.length)).toBe(false)
  })

  it('treats an unterminated fence as running to the end', () => {
    const open = 'Try:\n```\nnpm run build'
    expect(isInsideFence(open, caretOnLine(open, 0))).toBe(false)
    expect(isInsideFence(open, caretOnLine(open, 2))).toBe(true)
  })

  it('does not open on a self-contained one-line snippet', () => {
    const inline = 'Run ```npm test``` first.\nThen push.'
    expect(isInsideFence(inline, caretOnLine(inline, 1))).toBe(false)
  })

  it('handles a caret at either extreme without throwing', () => {
    expect(isInsideFence(note, 0)).toBe(false)
    expect(isInsideFence(note, note.length)).toBe(false)
    expect(isInsideFence('', 0)).toBe(false)
  })
})

describe('reindent', () => {
  it('indents every line by two spaces', () => {
    expect(reindent('a\nb', false)).toBe(`${INDENT}a\n${INDENT}b`)
  })

  it('outdents by up to two spaces, and stops at zero', () => {
    expect(reindent('  a\n b\nc', true)).toBe('a\nb\nc')
  })

  it('leaves a fully outdented block untouched', () => {
    expect(reindent('a\nb', true)).toBe('a\nb')
  })
})
