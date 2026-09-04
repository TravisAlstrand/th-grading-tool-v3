# Captured fixtures

Real data, captured from the live dataset (`supw1mz3` / `production`) on
2 September 2026, not invented content.

- `index.json` — the launcher's index query, trimmed to three techdegrees and
  a handful of projects each. Counts are the real ones.
- `projects.json` — the detail query for four real projects, complete:
  every grading section and every requirement, in rubric order. The four
  cover the shapes the resources panel has to render: one with a study guide
  and no mockups, one with neither, one with both a guide and a mockup, and
  one with no guide at all. `An Interactive Photo Gallery` is also the first
  project the launcher lists, so clicking through from the rail reaches a
  real rubric rather than the empty state.

These exist so the unit tests and the Playwright drive-through run against
requirement wording, ordering and exceeds flags that actually occur. The app
itself never reads them — it always fetches Sanity live. The browser test
intercepts the request and answers with these instead.

Note `"description": null` on every requirement. That is not a gap in the
capture; it is true of all 1,323 requirements in the dataset today. The same
goes for the null mockup fields — only 7 of 65 projects carry any, and only
3 of those carry all three.
