/**
 * Tab-to-indent inside a fenced code block in a note.
 *
 * Tab is load-bearing for keyboard users — it is how you leave a field — so
 * it is only intercepted where a literal tab is what you actually meant:
 * inside a ``` block. Everywhere else it keeps moving focus. Escape still
 * leaves the textarea either way, which is what keeps this from being a
 * keyboard trap, and the editor's footer says so.
 */

export const INDENT = '  '

/**
 * Edits through `insertText` rather than assigning to `.value`, because that
 * is what keeps the browser's own undo stack intact — a controlled textarea
 * whose value is reassigned loses ⌘Z for that edit. React sees the resulting
 * `input` event and the change flows through onChange as usual.
 */
function insertText(field: HTMLTextAreaElement, text: string): void {
  const inserted = document.execCommand?.('insertText', false, text)
  if (inserted) return

  // execCommand is deprecated; if a browser drops it, fall back to the native
  // value setter so React still notices the change.
  const { selectionStart, selectionEnd, value } = field
  const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd)
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set
  setValue?.call(field, next)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  const caret = selectionStart + text.length
  field.setSelectionRange(caret, caret)
}

/** Indent or outdent the lines a selection touches. Pure, so it is testable. */
export function reindent(block: string, outdent: boolean): string {
  return block
    .split('\n')
    .map((line) => (outdent ? line.replace(/^ {1,2}/, '') : INDENT + line))
    .join('\n')
}

/**
 * Returns true when the key was handled, so the caller knows whether to let
 * Tab through.
 */
export function indentInTextarea(field: HTMLTextAreaElement, outdent: boolean): boolean {
  const { selectionStart: start, selectionEnd: end, value } = field
  const spansLines = value.slice(start, end).includes('\n')

  // A plain caret mid-line just gets an indent where it sits.
  if (!outdent && !spansLines) {
    insertText(field, INDENT)
    return true
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const newlineAfter = value.indexOf('\n', end)
  const lineEnd = newlineAfter === -1 ? value.length : newlineAfter

  const block = value.slice(lineStart, lineEnd)
  const next = reindent(block, outdent)
  if (next === block) return true // nothing to outdent; still swallow the key

  field.setSelectionRange(lineStart, lineEnd)
  insertText(field, next)
  field.setSelectionRange(lineStart, lineStart + next.length)
  return true
}
