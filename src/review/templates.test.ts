import { describe, expect, it } from 'vitest'
import { SLACK_TEMPLATE, quoteWithFences, splitFences } from './templates'

/**
 * The fence state machine is the piece that decides whether a line goes out
 * quoted or verbatim, and both on-screen previews read a note through it too.
 * A regression here is visible in every review that contains a code block.
 */

const lines = (...l: string[]) => l.join('\n')

describe('quoteWithFences', () => {
  it('is what the Slack template quotes with', () => {
    expect(SLACK_TEMPLATE.quote).toBe(quoteWithFences)
  })

  it('quotes every line of a note that has no fences', () => {
    expect(quoteWithFences(lines('Only three phrases.', 'Add two more.'))).toBe(
      lines('> Only three phrases.', '> Add two more.'),
    )
  })

  it('leaves the delimiters and the code between them unquoted', () => {
    expect(
      quoteWithFences(lines('Swap these:', '```js', 'const x = 1', '```', 'And below.')),
    ).toBe(lines('> Swap these:', '```js', 'const x = 1', '```', '> And below.'))
  })

  it('keeps quoting after a code block closes, twice over', () => {
    expect(
      quoteWithFences(lines('Fix A:', '```', 'a', '```', 'Fix B:', '```', 'b', '```', 'Done.')),
    ).toBe(lines('> Fix A:', '```', 'a', '```', '> Fix B:', '```', 'b', '```', '> Done.'))
  })

  it('runs an unterminated fence to the end of the note', () => {
    // A reviewer who opened a fence and forgot to close it meant the rest to
    // be code; quietly reverting to quoting would put ">" inside the block.
    expect(quoteWithFences(lines('Try:', '```', 'npm run build', 'npm test'))).toBe(
      lines('> Try:', '```', 'npm run build', 'npm test'),
    )
  })

  it('does not open a fence on a self-contained one-line snippet', () => {
    expect(quoteWithFences(lines('Run ```npm test``` first.', 'Then push.'))).toBe(
      lines('> Run ```npm test``` first.', '> Then push.'),
    )
  })

  it('emits a bare ">" for a blank line, with no trailing space', () => {
    expect(quoteWithFences(lines('One.', '', 'Two.'))).toBe(lines('> One.', '>', '> Two.'))
  })

  it('treats an indented fence as a fence', () => {
    expect(quoteWithFences(lines('Here:', '  ```', '  code', '  ```'))).toBe(
      lines('> Here:', '  ```', '  code', '  ```'),
    )
  })
})

describe('splitFences', () => {
  it('groups contiguous prose and code into runs, delimiters with the code', () => {
    expect(splitFences(lines('Swap these:', '```js', 'const x = 1', '```', 'And below.'))).toEqual([
      { kind: 'prose', lines: ['Swap these:'] },
      { kind: 'code', lines: ['```js', 'const x = 1', '```'] },
      { kind: 'prose', lines: ['And below.'] },
    ])
  })

  it('returns a single prose run for a note with no fences', () => {
    expect(splitFences(lines('One.', 'Two.'))).toEqual([
      { kind: 'prose', lines: ['One.', 'Two.'] },
    ])
  })
})
