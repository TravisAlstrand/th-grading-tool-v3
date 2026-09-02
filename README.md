# Grading Tool

The tool Treehouse reviewers use to grade Techdegree project submissions. Pick a
project, walk its rubric marking each requirement met / questionable / needs work,
write feedback on the ones you flag, copy a Slack-formatted review to paste to the
student.

This is the v2 rewrite of the 2024 tool — a fresh codebase, not a refactor. It is
built to the Direction B ("Console") design: dense and keyboard-first. Dark is the
default; the toggle in the header switches to light, and a first visit follows the
OS setting. Both palettes are token overrides in `src/index.css`, so no component
carries a colour of its own.

## Running it

```bash
npm install
cp .env.example .env      # optional; the defaults are the real dataset
npm run dev
```

Rubrics come from the public read-only Sanity dataset (`supw1mz3` / `production`).
There is no token, no login and nothing to configure to get started.

**Install on the machine you will run it on.** Vite's bundler, Tailwind's oxide
and lightningcss all ship native binaries, and npm installs only the one for the
platform it is running on. A `node_modules` copied or installed from another OS
fails at startup with "Cannot find native binding". The lockfile lists every
platform, so the fix is always the same:

```bash
rm -rf node_modules && npm ci
```

## The keyboard loop

One requirement is focused at a time. Grading it moves you on.

| Key | Does |
| --- | --- |
| `J` / `K` or `↓` / `↑` | Move between requirements |
| `1` | Met — advances to the next unreviewed requirement |
| `2` | Questionable — opens the note and focuses it |
| `3` | Needs work — opens the note and focuses it |
| `0` | Not attempted |
| Same key again | Clears that grade |
| `E` | Jump into the note for the focused requirement |
| `M` | Mark every remaining requirement as met |
| `⌘↵` | In a note: save and advance. Otherwise: go to Review & send |
| `⌘Z` | Undo the last grade |
| `⌘K` | Search every project across every techdegree |
| `Esc` | Back out one level |

Two rules hold everywhere, and both are tested:

- **Every shortcut the app claims calls `preventDefault`.** Nothing it does not
  claim is bound at all — `⌘R` reloads, `⌘C` copies.
- **Single-key shortcuts are suspended while a text field has focus**, so you can
  type "1 2 3" into feedback without grading anything.

## Nothing is ever lost

Every change is written to `localStorage` immediately, keyed by project, so
several reviews can be in flight at once. Reload mid-review and the draft is
offered back on the launcher. Copying the review copies it and leaves it exactly
where it was; closing a review is a separate, confirmed action.

## How it is put together

```
src/
  sanity/      types, the two GROQ queries, one fetch, TanStack Query hooks
  review/      the grading domain — reducer, buildReview(), storage, key handling
  components/  presentational pieces
  routes/      launcher · review layout · grading · review & send
  test/        captured real rubrics, used by the tests only
dev/
  test-drive.mjs   Playwright drive-through of the real keyboard loop
```

Four decisions worth knowing about before changing anything:

1. **One source of truth for grading state.** A single reducer over a `grades`
   map keyed by requirement id, in `src/review/reducer.ts`. No component owns any
   grading state, and nothing is ever keyed by array index. This is what makes
   grades leaking between projects structurally impossible.
2. **`buildReview()` is pure.** Review in, output text out — no DOM, no React, no
   globals. It is the one place where a silent regression corrupts every review
   that goes out, so it stays pure and it stays tested.
3. **The review lives at a URL.** `/`, `/review/:projectId`,
   `/review/:projectId/send`. Reviews are linkable and the back button is safe.
4. **The Sanity query is split.** An index up front (65 project titles, with
   counts computed in GROQ), then one project's rubric on demand.

## Tests

```bash
npm test          # unit: buildReview() output, the reducer's transitions
npm run test:drive   # builds, then drives the real keyboard loop in Chromium
```

The drive-through never touches Sanity — it intercepts the request and answers
from `src/test/fixtures`, which are real rubrics captured from the live dataset.
It needs a Chromium: `npx playwright install chromium` once, or point
`CHROMIUM_EXECUTABLE` at one you already have.

## What is not here yet

Milestone 1 is the loop. Deliberately not built:

- **Snippet library, and "what you wrote here last time"** — milestone 2.
- **Email and plain-text output.** The template layer exists
  (`src/review/templates.ts`); only Slack is registered.
- **Review history, analytics, per-reviewer preferences, auth.** All of these
  need somewhere writable, which the current read-only public dataset is not.
  That decision — Sanity behind a serverless write token, or a small
  Postgres/Supabase alongside it — is milestone 3 and is deliberately open.

## A note on the rubric content

`Requirement.description` is rendered when Sanity has one. As of September 2026
no requirement in the dataset has one — all 1,323 are `null` — and `notes` and
`resources` do not exist on projects at all. The 2024 audit recorded these as
"fetched but never rendered"; the fetching was real, the content was not. The UI
is ready for it the day someone authors it.
