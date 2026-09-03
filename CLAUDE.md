# Working on this repo

Treehouse project-review tool. React + Vite + Tailwind v4, data from Sanity.
See README.md for what it is. This file is the things that are easy to get
wrong.

## Verify before reporting

Three gates, all of them cheap. Run all three:

```bash
npx vitest run     # ~83 unit tests
npx tsc -b         # noUnusedLocals is ON — see below
npm run test:drive # ~112 checks, real Chromium, real keystrokes
```

`dev/test-drive.mjs` is the important one. It builds, serves `dist`, drives
the app with actual key presses and clicks, and answers every Sanity request
from `src/test/fixtures`. It catches what unit tests cannot: focus, layout,
clipboard, theme, keyboard. **Add checks to it for UI behaviour** — several
past bugs existed only because nothing drove that button.

Two habits worth keeping:

- **Look at the result.** Screenshot with Playwright and actually read the
  image. Several regressions here were invisible to passing tests: buttons
  bunching mid-bar, a heading that read as smaller than its rows.
- **Check a claim before writing it in a comment.** Assertions in this
  codebase's comments are meant to be ones someone verified.

If `test:drive` fails to start with "Port 4319 is already in use", a previous
run orphaned the preview server: `lsof -ti :4319 | xargs kill`.

## Things that will bite you

**`noUnusedLocals` is on.** Removing anything from the UI usually orphans an
import, a helper or a destructured field, and the build fails. Expect to
clean up after every deletion.

**`cn()` is a plain join — no tailwind-merge.** A `className` passed from
outside does not override; both classes land and CSS order decides. Put the
choice inside the component (see `Button`'s `variant`/`size`).

**Sizes are hand-scaled to 110%.** There is no runtime `zoom`. Numbers in
components are the real sizes; Tailwind's `--spacing` and `--radius-*` are
scaled in `src/index.css`. The breakpoints are the design's 1180/900 × 1.1 =
**1298/990**. New arbitrary px values should be written at this scale.

**No colour literals in components.** Everything is a token in
`src/index.css`, which has a full light palette. A hex in a `className` will
be wrong in one of the two themes. Same for shadows and the palette scrim.

**No hardcoded `⌘`.** Shortcut labels go through `src/lib/platform.ts`
(`chord()`, `ENTER`) so Windows sees `Ctrl+K` / `Enter`. Handlers accept
`metaKey || ctrlKey` everywhere.

**Never use `window.confirm`.** Chrome's "prevent this page from creating
additional dialogs" makes it return `false` forever, and the action dies
silently — this shipped as a real bug. Use `ConfirmButton` from
`components/primitives.tsx` (arms on first press, commits on second).

## Domain rules that are deliberate

- **Three grades**: `met` (labelled "Passed"), `questioned`, `needs`. A
  fourth, `skipped`, was removed; `storage.ts` still migrates it on load so
  old drafts survive.
- **Exceeds requirements are optional.** They do not count toward
  `unreviewed`, so they never block a review. `M` marks remaining *required*
  as passed; `X` marks remaining *exceeds*. Keeping `M` scoped is what stops
  the app telling a student they passed work they never submitted.
- **Notes are kept but not sent** when a grade changes to a passing one.
  `buildReview` drops them from the output; the draft keeps the text so
  switching back restores it. The row says so.
- **`buildReview()` is pure and unit-tested** — it is the one place a silent
  regression reaches a student. Keep it free of DOM and hooks.
- **Fenced code in notes** is not blockquoted. `splitFences` in
  `review/templates.ts` is the shared parser, used by the output *and* both
  previews so they cannot disagree.

## Style

Match the surrounding code. Comments here explain *why*, especially where a
choice looks odd — they are load-bearing, not decoration.
