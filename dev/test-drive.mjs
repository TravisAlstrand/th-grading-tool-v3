/**
 * Drives the real keyboard loop in a real browser, end to end.
 *
 * Unit tests cover `buildReview()` and the reducer. This covers the thing
 * they cannot: that the keystrokes a reviewer actually presses reach those
 * functions, that no shortcut steals a key it should not, and that the text
 * on the send screen is the text the pure function produced.
 *
 * Run it with:   npm run build && npm run test:drive
 *
 * It never touches Sanity — every request to the API is intercepted and
 * answered from src/test/fixtures, which are real captured rubrics.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))

const INDEX = read('../src/test/fixtures/index.json')
const PROJECTS = read('../src/test/fixtures/projects.json')

const GAME_SHOW_ID = '57d592e8-4d55-4707-9ecc-0550361e95c8'
// Public API Requests — the fixture project with no studyGuide.
const NO_GUIDE_ID = PROJECTS.find((p) => !p.studyGuide)._id
// An Interactive Photo Gallery — carries the desktop mockup and nothing else.
const ONE_MOCKUP_ID = PROJECTS.find((p) => p.desktopMockup && !p.mobileMockup)._id
const PORT = 4319
const BASE = `http://localhost:${PORT}`

let failures = 0
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

async function startPreview() {
  const server = spawn(
    process.execPath,
    [new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname, 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite preview did not start in 20s')), 20000)
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes(String(PORT))) {
        clearTimeout(timer)
        resolve()
      }
    })
    server.stderr.on('data', (chunk) => process.stderr.write(chunk))
    server.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`vite preview exited with ${code} — did you run \`npm run build\`?`))
    })
  })
  return server
}

async function main() {
  const server = await startPreview()
  // Set CHROMIUM_EXECUTABLE if you have a Chromium that Playwright did not
  // install itself; otherwise `npx playwright install chromium` once.
  const browser = await chromium.launch(
    process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {},
  )
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })

  // Every Sanity request is answered from the captured fixtures.
  await context.route('**://*.api.sanity.io/**', async (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('query') ?? ''
    let result
    if (query.includes('_type == "techdegree"')) {
      result = INDEX
    } else {
      const id = JSON.parse(url.searchParams.get('$projectId') ?? '""')
      result = PROJECTS.find((p) => p._id === id) ?? null
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result }),
    })
  })

  const page = await context.newPage()
  const consoleErrors = []
  const failedRequests = []
  page.on('console', (msg) => {
    // A blocked webfont is the network's business, not the app's; the app
    // has a full fallback stack for both faces.
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) {
      consoleErrors.push(msg.text())
    }
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(BASE)) failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`)
  })

  const grades = () =>
    page.$$eval('[data-testid="requirement"]', (rows) =>
      rows.map((r) => r.dataset.grade),
    )
  const focusedTitle = () =>
    page.$eval('[data-focused="true"]', (el) => el.textContent?.trim() ?? '')

  /* ---------------- launcher ---------------- */

  section('Launcher')
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="launcher"]')
  check(
    'techdegree rail lists the techdegrees from the index query',
    (await page.textContent('body')).includes('Full Stack JavaScript'),
  )
  check(
    'the status bar offers the shortcut sheet instead of printing it',
    (await page.textContent('body')).includes('shortcuts') &&
      !(await page.textContent('body')).includes('J K move'),
  )
  check(
    'nothing is selected on arrival, so the right side is empty',
    !(await page.$('h1')) && !(await page.textContent('body')).includes('Game Show App'),
  )
  check(
    'and the first techdegree holds the keyboard',
    await page.evaluate(() => {
      const first = document.querySelector('[data-testid="techdegree"]')
      return document.activeElement === first
    }),
  )
  const focusedText = () =>
    page.evaluate(() => (document.activeElement?.textContent ?? '').replace(/\s+/g, ' ').trim())

  // J/K on the launcher, matching the grading screen. Focus is the state, so
  // Enter needs no special handling — it is just a button press.
  await page.keyboard.press('j')
  check('J moves down the techdegree list', (await focusedText()).includes('Full Stack JavaScript'))
  await page.keyboard.press('k')
  check('K moves back up', (await focusedText()).includes('Front End Web Development'))
  await page.keyboard.press('k')
  check('and stops at the top rather than wrapping', (await focusedText()).includes('Front End Web Development'))
  await page.keyboard.press('Tab')
  check('Tab still walks the list too', (await focusedText()).includes('Full Stack JavaScript'))
  await page.keyboard.press('Shift+Tab')

  await page.keyboard.press('Enter')
  await page.waitForSelector('h1')
  check(
    'choosing one reveals its projects',
    (await page.textContent('body')).includes('Game Show App'),
  )
  check('and drops the focus on the first project', (await focusedText()).includes('An Interactive Photo Gallery'))
  await page.keyboard.press('j')
  check('J moves down the projects', (await focusedText()).includes('Game Show App'))
  await page.keyboard.press('Escape')
  check('Esc returns to the techdegree that opened them', (await focusedText()).includes('Front End Web Development'))

  /* ---------------- command palette ---------------- */

  section('⌘K searches every project across every techdegree')
  await page.keyboard.press('Control+k')
  await page.waitForSelector('[role="dialog"]')
  await page.keyboard.type('jk')
  check('j and k type into the palette rather than moving focus', (await page.inputValue('[role="dialog"] input')) === 'jk')
  await page.fill('[role="dialog"] input', '')
  await page.keyboard.type('game show')
  const paletteResults = await page.$$eval('[role="dialog"] button', (b) =>
    b.map((x) => x.textContent),
  )
  check('palette filters to the matching project', paletteResults.length === 1, paletteResults.join(' | '))
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid="requirement"]')
  check('Enter opens the review at its own URL', page.url().endsWith(`/review/${GAME_SHOW_ID}`))

  /* ---------------- the keyboard loop ---------------- */

  section('The keyboard loop')
  check('focus starts on the first requirement', (await focusedTitle()).includes('An array of strings'))

  await page.keyboard.press('1')
  check('1 grades met', (await grades())[0] === 'met')
  check('...and advances', (await focusedTitle()).includes('5 phrases are in the array'))

  await page.keyboard.press('j')
  check('j moves down', (await focusedTitle()).includes('Phrases in array include only letters'))
  await page.keyboard.press('k')
  check('k moves back up', (await focusedTitle()).includes('5 phrases are in the array'))

  await page.keyboard.press('1')
  await page.keyboard.press('k')
  await page.keyboard.press('1')
  check('the same key again clears the grade', (await grades())[1] === 'none')

  await page.keyboard.press('1')
  check('and pressing it once more re-applies it', (await grades())[1] === 'met')

  /* ---------------- flagging and notes ---------------- */

  section('Flagging drops you into the note')
  await page.keyboard.press('3')
  check('3 grades needs work', (await grades())[2] === 'needs')
  check(
    'focus moves into the note, not to the next requirement',
    await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'),
  )

  await page.keyboard.type('Only 3 phrases, and 2 contain digits.')
  check(
    'digits typed into a note are text, not grades',
    (await page.inputValue('textarea')) === 'Only 3 phrases, and 2 contain digits.',
  )
  check('typing "3" into the note did not regrade anything', (await grades())[2] === 'needs')

  await page.keyboard.press('Control+Enter')
  check(
    '⌘↵ leaves the note and advances',
    await page.evaluate(() => document.activeElement?.tagName !== 'TEXTAREA'),
  )

  /* ---------------- reading the list ---------------- */

  section('The list stays readable')
  const listState = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      return r.width > 2 && r.height > 2
    }
    const statuses = [...document.querySelectorAll('[data-testid="requirement"]')].map((row) => {
      const word = [...row.querySelectorAll('span')].find((sp) =>
        ['passed', 'questioned', 'needs work', 'unreviewed'].includes(
          sp.textContent.trim(),
        ),
      )
      return { grade: row.dataset.grade, word: word?.textContent.trim(), shown: word ? visible(word) : false }
    })
    const header = [...document.querySelectorAll('h2')][0]
    return {
      ungradedShowingAWord: statuses.filter((s) => s.grade === 'none' && s.shown).length,
      gradedShowingAWord: statuses.filter((s) => s.grade !== 'none' && s.shown).length,
      unreviewedStillInDom: statuses.filter((s) => s.word === 'unreviewed').length,
      headerText: header?.textContent ?? '',
      headerSize: header ? parseFloat(getComputedStyle(header).fontSize) : 0,
      rowTitleSize: parseFloat(
        getComputedStyle(
          document.querySelector('[data-testid="requirement"] span[class*="leading"]'),
        ).fontSize,
      ),
    }
  })
  // "unreviewed" was printed on every ungraded row; it is now for screen
  // readers only, so the column of grey defaults is gone from the page.
  check('ungraded rows print no status word', listState.ungradedShowingAWord === 0)
  check('graded rows still do', listState.gradedShowingAWord > 0)
  check(
    'the unreviewed state is still in the accessibility tree',
    listState.unreviewedStillInDom > 0,
  )
  // The header used to be smaller than the rows it organised.
  check(
    'the section heading outweighs the requirement text',
    listState.headerSize > listState.rowTitleSize,
    `heading ${listState.headerSize}px vs row ${listState.rowTitleSize}px`,
  )
  const progress = await page.evaluate(
    () => [...document.querySelectorAll('span')].filter((s) => /^\d+ of \d+ graded$/.test(s.textContent.trim())).length,
  )
  check('every section header carries its own progress', progress >= 4, `${progress} headers`)

  // The band used to be one step off the page grey, which read as another
  // row. Both halves of the fix are checked: it is a hue, not a shade, and
  // there is real space above it.
  const grouping = await page.evaluate(() => {
    const bands = [...document.querySelectorAll('h2')].map((h) => h.parentElement)
    const column = bands[0].parentElement.parentElement
    const paint = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
      }
      return getComputedStyle(document.body).backgroundColor
    }
    const rgb = (c) => c.match(/\d+/g).map(Number)
    const secondTop = bands[1].getBoundingClientRect().top
    const above = [...document.querySelectorAll('[data-testid="requirement"]')].filter(
      (r) => r.getBoundingClientRect().bottom <= secondTop + 1,
    )
    return {
      band: rgb(paint(bands[0])),
      column: rgb(paint(column)),
      gap: Math.round(secondTop - above[above.length - 1].getBoundingClientRect().bottom),
    }
  })
  check(
    'the section band is a hue, not another grey',
    grouping.band[2] - grouping.band[0] >= 12,
    `band rgb(${grouping.band})`,
  )
  check(
    'and is distinct from the column behind the rows',
    grouping.band.some((v, i) => Math.abs(v - grouping.column[i]) >= 5),
    `band rgb(${grouping.band}) vs column rgb(${grouping.column})`,
  )
  check(
    'sections are separated by a gap, not just a rule',
    grouping.gap >= 12,
    `${grouping.gap}px between the last row and the next band`,
  )

  /* ---------------- tab indents inside a fence ---------------- */

  section('Tab indents, but only inside a code block')
  await page.keyboard.press('j')
  await page.waitForTimeout(120)
  await page.keyboard.press('3')
  await page.waitForSelector('textarea')
  await page.keyboard.type('Swap these:')
  // Outside a fence Tab must keep its normal job of leaving the field.
  await page.keyboard.press('Tab')
  await page.waitForTimeout(150)
  check(
    'outside a code block, Tab still moves focus out',
    await page.evaluate(() => document.activeElement?.tagName !== 'TEXTAREA'),
  )

  await page.click('textarea')
  await page.evaluate(() => {
    const t = document.querySelector('textarea')
    t.setSelectionRange(t.value.length, t.value.length)
  })
  await page.keyboard.press('Enter')
  await page.keyboard.type('```js')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('const total = 1')
  const indented = await page.inputValue('textarea')
  check('inside a code block, Tab indents', indented.includes('\n  const total = 1'), JSON.stringify(indented))
  check('focus stayed in the note', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'))

  await page.keyboard.press('Shift+Tab')
  const outdented = await page.inputValue('textarea')
  check('Shift+Tab outdents again', outdented.includes('\nconst total = 1'), JSON.stringify(outdented))
  check('the hint appears once there is a code block', (await page.textContent('body')).includes('Tab indents inside'))

  // Escape is the way out, so intercepting Tab is not a keyboard trap.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  check(
    'Esc still leaves the field from inside a code block',
    await page.evaluate(() => document.activeElement?.tagName !== 'TEXTAREA'),
  )
  // Put this requirement back to unreviewed for the checks that follow.
  await page.keyboard.press('3')
  await page.waitForTimeout(120)
  await page.keyboard.press('k')
  await page.waitForTimeout(120)

  /* ---------------- notes follow the grade ---------------- */

  section('Feedback follows the grade')
  // Requirement 2 is graded needs-work with a note at this point.
  await page.keyboard.press('k')
  await page.waitForTimeout(120)
  const noteText = 'Only 3 phrases, and 2 contain digits.'
  check('the note is in the live output while flagged', (await page.textContent('body')).includes(`> ${noteText}`))
  await page.keyboard.press('1')
  await page.waitForTimeout(150)
  const afterPass = await page.textContent('body')
  check('switching to the passing grade drops it from the output', !afterPass.includes(`> ${noteText}`))
  check('and the row says the feedback is being held', afterPass.includes('feedback kept, not sent'))
  // A passing grade advances the focus, so step back before regrading —
  // otherwise this flags the following requirement instead.
  await page.keyboard.press('k')
  await page.waitForTimeout(120)
  await page.keyboard.press('3')
  await page.waitForTimeout(150)
  check(
    'switching back restores it, text intact',
    (await page.inputValue('textarea')) === noteText,
  )
  await page.keyboard.press('Escape')

  /* ---------------- shortcuts v1 broke ---------------- */

  section('Shortcuts the 2024 tool broke')
  const urlBefore = page.url()
  await page.keyboard.press('Control+r')
  await page.waitForTimeout(250)
  check('Ctrl+R is not bound, so nothing hijacks reload', page.url() === urlBefore)
  check('the review is still on screen after Ctrl+R', (await grades())[0] === 'met')

  /* ---------------- mark remaining, undo ---------------- */

  section('Mark remaining as passed, and undo')
  await page.keyboard.press('m')
  await page.waitForTimeout(120)
  check(
    'M closes out every remaining requirement',
    (await page.textContent('[data-testid="unreviewed-count"]')) === '0 unreviewed',
  )
  check('and leaves the flagged one flagged', (await grades())[2] === 'needs')

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(120)
  const afterUndo = await page.textContent('[data-testid="unreviewed-count"]')
  check('⌘Z undoes mark-remaining in one step', afterUndo !== '0 unreviewed', afterUndo)
  await page.keyboard.press('m')
  await page.waitForTimeout(120)
  // M is required-only now, so grade the optional ones the way a reviewer
  // would when a student did attempt them — the rest of the run checks that
  // a graded exceeds still reaches the output with its marker.
  await page.keyboard.press('x')
  await page.waitForTimeout(120)
  check(
    'X closes out the exceeds requirements',
    !(await page.isVisible('[data-testid="exceeds-ungraded"]')),
  )

  /* ---------------- autosave ---------------- */

  section('Nothing is ever lost')
  await page.reload()
  await page.waitForSelector('[data-testid="requirement"]')
  check('the draft comes back after a reload', (await grades())[2] === 'needs')
  check(
    'including the note',
    (await page.textContent('body')).includes('Only 3 phrases, and 2 contain digits.'),
  )

  await page.goto(BASE)
  await page.waitForSelector('[data-testid="launcher"]')
  check('the launcher offers the draft to resume', (await page.textContent('body')).includes('Resume'))
  // Drafts are not owned by the selected techdegree, so they show with
  // nothing picked and they sit above the techdegree heading, not under it.
  check('saved reviews show with no techdegree selected', await page.isVisible('[data-testid="resume-drafts"]'))
  // Every other check here goes by test id, so the heading itself was never
  // asserted and could be renamed out from under the UI unnoticed.
  check(
    'and the section is headed "Saved reviews"',
    (await page.textContent('[data-testid="resume-drafts"]')).includes('Saved reviews'),
    await page.$eval('[data-testid="resume-drafts"] .label', (el) => el.textContent.trim()),
  )
  check('and nothing is auto-selected on the way back', !(await page.$('h1')))
  await page.click('[data-testid="techdegree"]:visible')
  await page.waitForSelector('h1')
  check(
    'they stay above the techdegree heading once one is chosen',
    await page.evaluate(() => {
      const drafts = document.querySelector('[data-testid="resume-drafts"]')
      const heading = document.querySelector('h1')
      return drafts.getBoundingClientRect().top < heading.getBoundingClientRect().top
    }),
  )
  await page.click('text=Continue')
  await page.waitForSelector('[data-testid="requirement"]')

  /* ---------------- review and send ---------------- */

  section('Review & send')
  await page.keyboard.press('Control+Enter')
  await page.waitForSelector('text=Slack preview')
  check('⌘↵ goes to the send screen', page.url().endsWith('/send'))

  const output = await page.evaluate(() => {
    const el = [...document.querySelectorAll('textarea')]
    return { opening: el[0]?.value, closing: el[el.length - 1]?.value }
  })
  check('the opening line is editable', typeof output.opening === 'string' && output.opening.length > 0)
  check('the closing line is editable', typeof output.closing === 'string' && output.closing.length > 0)

  const body = await page.textContent('body')
  check('the flagged requirement is grouped under Needs work', body.includes('Needs work'))

  // Groups start collapsed, so the editable column is just counts plus the
  // opening and closing lines. Scope this to the left column — the Slack
  // preview on the right renders notes regardless, and a whole-body search
  // would pass without the group ever opening.
  const editable = () => page.$eval('.overflow-y-auto', (el) => el.textContent)
  check(
    'review groups start collapsed',
    !(await editable()).includes('Only 3 phrases, and 2 contain digits.'),
  )
  check('collapsed groups still show their counts', (await editable()).includes('Needs work'))
  await page.click('[data-testid="group-needs"]')
  await page.waitForTimeout(150)
  check(
    'expanding a group reveals the requirement and its note',
    (await editable()).includes('Only 3 phrases, and 2 contain digits.'),
  )
  await page.click('[data-testid="group-needs"]')
  await page.waitForTimeout(150)
  check('and it collapses again', !(await editable()).includes('Only 3 phrases, and 2 contain digits.'))

  await page.click('text=Copy to clipboard')
  await page.waitForTimeout(300)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  check('copy writes the Slack-formatted review', clipboard.includes(':needs-work:'))
  check('exceeds requirements carry the exceeds marker', clipboard.includes(':exceeds:'))
  check('the note is quoted', clipboard.includes('> Only 3 phrases, and 2 contain digits.'))
  check('met items are grouped before flagged ones', clipboard.indexOf(':meets:') < clipboard.indexOf(':needs-work:'))
  // What lands in Slack is the thing that matters, so assert on the actual
  // clipboard rather than only on buildReview's return value.
  const markedLines = clipboard
    .split('\n')
    .filter((l) => /^:(meets|questioned|needs-work):/.test(l))
  check(
    'every marker is followed by a space before the title',
    markedLines.length > 0 && markedLines.every((l) => /^:[a-z-]+: \S/.test(l)),
    markedLines.find((l) => !/^:[a-z-]+: \S/.test(l)) ?? '',
  )
  check(
    'and an exceeds line keeps both markers spaced',
    clipboard.includes(':meets: :exceeds: ') || clipboard.includes(':needs-work: :exceeds: '),
    markedLines.find((l) => l.includes(':exceeds:')) ?? 'no exceeds line',
  )
  const clipLines = clipboard.trimEnd().split('\n')
  const ruleAt = clipLines.findIndex((l) => /^─+$/.test(l))
  check(
    'a rule separates the requirements from the closing line',
    ruleAt > 0 && clipLines.slice(ruleAt + 1).join('\n').trim().length > 0,
    ruleAt === -1 ? 'no rule' : clipLines.slice(ruleAt - 1, ruleAt + 2).join(' ⏎ '),
  )
  check(
    'and nothing after the rule carries a grade marker',
    !clipLines.slice(ruleAt + 1).some((l) => /^:(meets|questioned|needs-work):/.test(l)),
  )
  // Passing items stack; flagged ones get air, because they may carry a note.
  const metLines = clipLines.filter((l) => l.startsWith(':meets:'))
  const firstMet = clipLines.findIndex((l) => l.startsWith(':meets:'))
  check(
    'passing items sit directly on top of each other',
    metLines.length < 2 || clipLines[firstMet + 1].startsWith(':meets:'),
    clipLines.slice(firstMet, firstMet + 2).join(' ⏎ '),
  )
  const flaggedAt = clipLines.findIndex((l) => /^:(questioned|needs-work):/.test(l))
  check(
    'and a flagged item has a blank line above it',
    flaggedAt > 0 && clipLines[flaggedAt - 1] === '',
    clipLines.slice(Math.max(0, flaggedAt - 2), flaggedAt + 1).join(' ⏎ '),
  )
  check('copying leaves the review exactly where it was', page.url().endsWith('/send'))
  check(
    'the toast says just what happened',
    (await page.textContent('body')).includes('Review copied'),
  )
  // The preview redraws the message instead of printing the built text, so
  // it is the one that can drift from what the student receives.
  check(
    'the Slack preview shows the same rule the output has',
    (await page.isVisible('[data-testid="preview-rule"]')) === /─/.test(clipboard),
  )

  // The rule is off-switchable per review, for the case where there is no
  // closing line to separate.
  check('the rule toggle is on by default', await page.isChecked('[data-testid="divider-toggle"]'))
  await page.uncheck('[data-testid="divider-toggle"]')
  await page.waitForTimeout(200)
  check('unchecking it drops the rule from the preview', !(await page.isVisible('[data-testid="preview-rule"]')))
  await page.click('text=Copy to clipboard')
  await page.waitForTimeout(300)
  const noRule = await page.evaluate(() => navigator.clipboard.readText())
  check('and from the copied output', !/─/.test(noRule))
  check(
    'while the rest of the review is untouched',
    noRule.includes(':needs-work:') && noRule.includes('> Only 3 phrases, and 2 contain digits.'),
  )
  // It is part of the review, so it has to survive a reload like the rest.
  await page.reload()
  await page.waitForSelector('[data-testid="divider-toggle"]')
  check('the choice is saved with the draft', !(await page.isChecked('[data-testid="divider-toggle"]')))
  await page.check('[data-testid="divider-toggle"]')
  await page.waitForTimeout(200)
  check('and turning it back on restores the rule', await page.isVisible('[data-testid="preview-rule"]'))


  check(
    'and does not reload the page',
    (await page.textContent('body')).includes('Only 3 phrases, and 2 contain digits.'),
  )

  // Leaving must not be the same gesture as discarding: `Close review` throws
  // the draft away, and it used to be the only one-click way out of here.
  const draftsBefore = await page.evaluate(
    () => Object.keys(localStorage).filter((k) => k.includes('draft')).length,
  )
  await page.click('[data-testid="home-button"]')
  await page.waitForSelector('[data-testid="launcher"]')
  check('the home button leaves the send screen in one click', !page.url().includes('/send'))
  check(
    'and keeps the draft rather than discarding it',
    (await page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.includes('draft')).length,
    )) === draftsBefore && draftsBefore > 0,
    `${draftsBefore} before`,
  )
  check(
    'so the review is waiting under saved reviews',
    await page.isVisible('[data-testid="resume-drafts"]'),
  )
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}/send`)
  await page.waitForSelector('[data-testid="home-button"]')

  /* ---------------- light and dark ---------------- */

  section('Light and dark')
  const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme)
  const pageBg = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  const toggleLabel = () =>
    page.getAttribute('[data-testid="theme-toggle"]:visible', 'aria-label')

  check('a theme is resolved before React ever renders', ['light', 'dark'].includes(await themeOf()))
  // The button advertises where it takes you, not where you are.
  check(
    'the toggle offers the theme you are not in',
    (await toggleLabel()) === `Switch to ${(await themeOf()) === 'dark' ? 'light' : 'dark'} theme`,
    await toggleLabel(),
  )
  const startedAs = await themeOf()
  const darkBg = await pageBg()

  await page.click('[data-testid="theme-toggle"]:visible')
  await page.waitForTimeout(150)
  check('the toggle flips the theme', (await themeOf()) !== startedAs)
  check(
    'and now offers the way back',
    (await toggleLabel()) === `Switch to ${startedAs} theme`,
    await toggleLabel(),
  )
  check('and the page actually repaints', (await pageBg()) !== darkBg)
  check('the choice is written to storage', await page.evaluate(() => localStorage.getItem('grading-tool:theme')) === (await themeOf()))

  const flipped = await themeOf()
  await page.reload()
  await page.waitForSelector('text=Slack preview')
  check('the choice survives a reload', (await themeOf()) === flipped)
  check('the review is still on screen after the reload', (await page.textContent('body')).includes('Only 3 phrases, and 2 contain digits.'))

  // The toggle has to be reachable from every screen; there is no shared header.
  await page.click('text=Back to rubric')
  await page.waitForSelector('[data-testid="requirement"]')
  check('the toggle is on the grading screen', await page.isVisible('[data-testid="theme-toggle"]:visible'))
  await page.click('text=← Projects')
  await page.waitForSelector('[data-testid="launcher"]')
  check('the toggle is on the launcher', await page.isVisible('[data-testid="theme-toggle"]:visible'))
  check(
    'exactly one toggle is visible at a time',
    (await page.$$('[data-testid="theme-toggle"]:visible')).length === 1,
  )

  await page.click('[data-testid="theme-toggle"]:visible')
  await page.waitForTimeout(150)
  check('and toggles back from there', (await themeOf()) === startedAs)

  await page.click('text=Continue')
  await page.waitForSelector('[data-testid="requirement"]')
  await page.keyboard.press('Control+Enter')
  await page.waitForSelector('text=Slack preview')

  /* ---------------- discarding a draft ---------------- */

  section('Discarding a draft')
  // Never covered before, which is how a silent failure here went unnoticed.
  // The confirmation is in the page, not a browser dialog: window.confirm can
  // be switched off by the viewer ("prevent this page from creating
  // additional dialogs") and then returns false forever, leaving the button
  // dead with no feedback.
  let dialogsOpened = 0
  page.on('dialog', async (d) => {
    dialogsOpened += 1
    await d.accept()
  })
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="resume-drafts"]')
  await page.click('text=Discard')
  await page.waitForTimeout(150)
  check('the first press asks rather than acting', await page.isVisible('[data-armed="true"]'))
  check(
    'and the draft is still there',
    (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('draft')).length)) > 0,
  )
  await page.click('[data-armed="true"]')
  await page.waitForTimeout(300)
  check(
    'the second press discards it',
    (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('draft')).length)) === 0,
  )
  check('the card goes with it', !(await page.isVisible('[data-testid="resume-drafts"]').catch(() => false)))
  check('no browser dialog was involved', dialogsOpened === 0, String(dialogsOpened))

  /* ---------------- exceeds are optional ---------------- */

  section('Exceeds do not hold a review hostage')
  await page.setViewportSize({ width: 1440, height: 900 })
  // Start from a genuinely fresh review — the draft from the run above is
  // still in storage and would be restored over the top of this one.
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  await page.keyboard.press('m')
  await page.waitForTimeout(250)
  const swept = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="requirement"]')]
      .filter((r) => r.textContent.includes('EXCEEDS'))
      .map((r) => r.dataset.grade),
  )
  // The old behaviour marked these met, and the student was told they had
  // passed exceeds work they never submitted.
  check('M leaves the exceeds requirements ungraded', swept.every((g) => g === 'none'), swept.join(','))
  check(
    'yet nothing required is left unreviewed',
    (await page.textContent('[data-testid="unreviewed-count"]')).startsWith('0 '),
  )
  check('the ungraded exceeds are still counted, quietly', await page.isVisible('[data-testid="exceeds-ungraded"]'))
  check(
    'and the send button is live',
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Review & send'))
      return getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)'
    }),
  )
  await page.keyboard.press('Control+Enter')
  await page.waitForSelector('text=Slack preview')
  await page.click('text=Copy to clipboard')
  await page.waitForTimeout(300)
  const exceedsClip = await page.evaluate(() => navigator.clipboard.readText())
  check('copy works with exceeds ungraded', exceedsClip.includes(':meets:'))
  check('and no unattempted exceeds is claimed as met', !exceedsClip.includes(':exceeds:'))

  // This is the state the old single number described as "nothing
  // unreviewed": every required requirement graded, every exceeds untouched.
  const sendStatus = () => page.textContent('[data-testid="send-status"]')
  check(
    'the send screen states both halves, not just the required one',
    (await sendStatus()).includes('all meets reviewed') &&
      /\d+ exceeds unreviewed/.test(await sendStatus()),
    await sendStatus(),
  )
  check(
    'and does not call that clear',
    !(await sendStatus()).includes('nothing unreviewed'),
    await sendStatus(),
  )
  // Optional work outstanding is grey, not amber — it blocks nothing.
  check(
    'the outstanding exceeds are stated quietly',
    await page.evaluate(() => {
      const parts = [...document.querySelectorAll('[data-testid="send-status"] span')]
      const ex = parts.find((p) => /exceeds unreviewed/.test(p.textContent))
      const amber = getComputedStyle(document.documentElement).getPropertyValue('--color-questioned').trim()
      return Boolean(ex) && getComputedStyle(ex).color !== amber
    }),
  )

  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  await page.keyboard.press('x')
  await page.waitForTimeout(250)
  const afterX = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="requirement"]')]
      .filter((r) => r.textContent.includes('EXCEEDS'))
      .map((r) => r.dataset.grade),
  )
  check('X marks the exceeds when a student did attempt them', afterX.every((g) => g === 'met'), afterX.join(','))

  // With both halves done, the two-part reading collapses back to one.
  await page.keyboard.press('m')
  await page.waitForTimeout(250)
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}/send`)
  await page.waitForSelector('[data-testid="send-status"]')
  check(
    'with everything graded it says just "nothing unreviewed"',
    (await page.textContent('[data-testid="send-status"]')).trim() === 'nothing unreviewed',
    await page.textContent('[data-testid="send-status"]'),
  )

  /* ---------------- reflow ---------------- */

  section('Reflow')
  // The UI is zoomed to --ui-scale, and CSS zoom does not shrink the layout
  // viewport a media query sees — so the breakpoints are the design's 1180
  // and 900 scaled to 1298 and 990. Both sides of each are pinned here; a
  // one-sided check would still pass if a breakpoint drifted far off.
  await page.setViewportSize({ width: 1350, height: 900 })
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  check('the live output panel shows above 1298px', await page.isVisible('text=Slack output'))
  await page.setViewportSize({ width: 1250, height: 900 })
  await page.waitForTimeout(120)
  check('and hides below it', !(await page.isVisible('text=Slack output')))

  await page.setViewportSize({ width: 1000, height: 900 })
  await page.waitForTimeout(120)
  check('the section rail survives above 990px', await page.isVisible('text=Sections'))
  await page.setViewportSize({ width: 950, height: 900 })
  await page.waitForTimeout(120)
  check('and collapses below it', !(await page.isVisible('text=Sections')))
  await page.setViewportSize({ width: 820, height: 900 })
  await page.waitForTimeout(120)
  check(
    'the requirements are still there in the single column',
    (await page.$$('[data-testid="requirement"]')).length === 14,
  )
  // The toggle lives in the collapsed rail, so the header copy has to take over.
  check(
    'the theme toggle survives the rail collapsing',
    (await page.$$('[data-testid="theme-toggle"]:visible')).length === 1,
  )
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="launcher"]')
  check(
    'and on the launcher too',
    (await page.$$('[data-testid="theme-toggle"]:visible')).length === 1,
  )

  /* ---------------- the shortcut sheet ---------------- */

  // The bar printed all nine grading shortcuts on every screen and wrapped
  // onto a second line below 1298px. They live behind `?` now, so the keys
  // that open it — and the keys it must suspend while open — are covered.
  section('? opens the shortcut sheet')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  check('the grading bar no longer prints the cheat sheet', !(await page.textContent('body')).includes('mark exceeds'))

  await page.keyboard.press('?')
  await page.waitForSelector('[data-testid="shortcuts"]')
  check('? opens it', await page.isVisible('[data-testid="shortcuts"]'))
  const sheet = await page.textContent('[data-testid="shortcuts"]')
  // The letter keys carry the word they stand for. X is bracketed because it
  // is the only one that is not the initial of its word.
  check(
    'the letter keys name the word they stand for',
    ['EDIT', 'RESOURCES', 'MEETS', 'E(X)CEEDS'].every((m) => sheet.includes(m)),
    ['EDIT', 'RESOURCES', 'MEETS', 'E(X)CEEDS'].filter((m) => !sheet.includes(m)).join(', '),
  )
  check(
    'it carries the grading keys that left the bar',
    ['Move between requirements', 'meets requirement', 'exceeds requirement', 'Undo the last change'].every(
      (t) => sheet.includes(t),
    ),
  )

  // The sheet is an overlay like the palette, so single-key grading
  // shortcuts must not fire underneath it.
  const beforeSheet = await grades()
  await page.keyboard.press('1')
  await page.waitForTimeout(120)
  check(
    'grading keys do not fire underneath it',
    JSON.stringify(await grades()) === JSON.stringify(beforeSheet),
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  check('Esc closes it', !(await page.isVisible('[data-testid="shortcuts"]')))
  check('and Esc did not also fall through to leaving the review', page.url().includes(GAME_SHOW_ID))
  await page.keyboard.press('1')
  await page.waitForTimeout(120)
  check('grading keys work again once it is closed', JSON.stringify(await grades()) !== JSON.stringify(beforeSheet))

  // Clicking is the other way in — the sheet should not need the shortcut it
  // documents in order to be found.
  await page.click('[data-testid="shortcuts-hint"]')
  await page.waitForSelector('[data-testid="shortcuts"]')
  check('the status-bar hint opens it too', await page.isVisible('[data-testid="shortcuts"]'))
  await page.keyboard.press('?')
  await page.waitForTimeout(120)
  check('? closes it again', !(await page.isVisible('[data-testid="shortcuts"]')))

  // `?` is a plain character, so it has to stay out of the way of typing.
  await page.keyboard.press('1')
  await page.waitForTimeout(120)
  await page.keyboard.press('2')
  await page.waitForSelector('textarea')
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA')
  await page.keyboard.type('why? because')
  await page.waitForTimeout(120)
  check('? types into a note rather than opening the sheet', !(await page.isVisible('[data-testid="shortcuts"]')))
  check(
    'and the question mark reached the note',
    (await page.inputValue('textarea')).includes('why? because'),
  )
  await page.keyboard.press('Escape')

  /* ---------------- the resources panel ---------------- */

  section('R opens the resources panel')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  await page.keyboard.press('r')
  await page.waitForSelector('[data-testid="resources"]')
  check('R opens it', await page.isVisible('[data-testid="resources"]'))

  const links = await page.$$eval('[data-testid="resource-link"]', (els) =>
    els.map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
  )
  check(
    'it lists the study guide and all three validators',
    links.length === 4 && links.some((l) => l.href.includes('drive.google.com')),
    `${links.length} links`,
  )
  // Opening a link must not take the review with it.
  check(
    'every link opens in a new tab, with rel set',
    links.every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel)),
  )

  // Opening used to leave focus behind the dialog, two or three tabs away
  // from the first link.
  const focusedLink = () =>
    page.evaluate(() => {
      const a = document.activeElement
      return a?.dataset?.testid === 'resource-link' ? a.textContent.trim() : `<${a?.tagName ?? 'none'}>`
    })
  check('the first link takes focus on open', (await focusedLink()).startsWith('Game Show App'), await focusedLink())

  await page.keyboard.press('j')
  await page.waitForTimeout(80)
  check('J moves to the next link', (await focusedLink()).startsWith('CSS Validator'), await focusedLink())
  await page.keyboard.press('k')
  await page.waitForTimeout(80)
  check('and K comes back', (await focusedLink()).startsWith('Game Show App'))
  await page.keyboard.press('k')
  await page.waitForTimeout(80)
  check('K stops at the top rather than escaping the dialog', (await focusedLink()).startsWith('Game Show App'))

  // aria-modal is a promise that Tab does not walk out of the dialog. One
  // full cycle proves both halves: it stayed in, and it came back round.
  for (let i = 0; i < links.length; i += 1) await page.keyboard.press('Tab')
  await page.waitForTimeout(80)
  check(
    `Tab wraps within the dialog after ${links.length} presses`,
    (await focusedLink()).startsWith('Game Show App'),
    await focusedLink(),
  )

  const beforeR = await grades()
  await page.keyboard.press('1')
  await page.waitForTimeout(120)
  check(
    'grading keys do not fire underneath it',
    JSON.stringify(await grades()) === JSON.stringify(beforeR),
  )
  await page.keyboard.press('r')
  await page.waitForTimeout(120)
  check('R closes it again', !(await page.isVisible('[data-testid="resources"]')))
  check(
    'and focus does not stay on the link that is gone',
    await page.evaluate(() => document.activeElement?.dataset?.testid !== 'resource-link'),
  )
  await page.click('[data-testid="resources-hint"]')
  await page.waitForSelector('[data-testid="resources"]')
  check('the status-bar hint opens it too', await page.isVisible('[data-testid="resources"]'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  check('Esc closes it without leaving the review', !(await page.isVisible('[data-testid="resources"]')) && page.url().includes(GAME_SHOW_ID))

  // R is a bare letter, so it has to stay out of the way of writing feedback.
  await page.keyboard.press('1')
  await page.waitForTimeout(120)
  await page.keyboard.press('2')
  await page.waitForSelector('textarea')
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA')
  await page.keyboard.type('refactor the render')
  await page.waitForTimeout(120)
  check('R types into a note rather than opening the panel', !(await page.isVisible('[data-testid="resources"]')))
  check(
    'and the letter reached the note',
    (await page.inputValue('textarea')).includes('refactor the render'),
  )
  await page.keyboard.press('Escape')

  // A project with no study guide should show the validators and no empty heading.
  await page.goto(`${BASE}/review/${NO_GUIDE_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  await page.keyboard.press('r')
  await page.waitForSelector('[data-testid="resources"]')
  const noGuide = await page.textContent('[data-testid="resources"]')
  check(
    'a project without a study guide shows no empty group',
    !noGuide.includes('Study guide') && noGuide.includes('Validators'),
  )
  check('and no mockup group when it has none', !noGuide.includes('ockup'))
  await page.keyboard.press('Escape')

  // Mockups are three independently nullable fields; the common case is a
  // subset. This fixture carries the desktop one only.
  await page.goto(`${BASE}/review/${ONE_MOCKUP_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  await page.keyboard.press('r')
  await page.waitForSelector('[data-testid="resources"]')
  const oneMockup = await page.textContent('[data-testid="resources"]')
  check(
    'a project with one mockup lists just that one',
    oneMockup.includes('Desktop mockup') &&
      !oneMockup.includes('Mobile mockup') &&
      !oneMockup.includes('Tablet mockup'),
  )
  // Read the headings as elements: textContent concatenates the heading
  // straight into the first row, so "Mockup" and "MockupDesktop mockup" are
  // the same string to a substring test.
  const headings = () =>
    page.$$eval('[data-testid="resources"] .label', (els) => els.map((e) => e.textContent.trim()))
  check(
    'and the heading is singular when there is one',
    (await headings()).includes('Mockup'),
    (await headings()).join(' · '),
  )
  const mockHref = await page.$$eval('[data-testid="resource-link"]', (els) =>
    els.map((a) => a.getAttribute('href')).find((h) => h.includes('mockup')),
  )
  check('the mockup link is the URL from Sanity', Boolean(mockHref), mockHref ?? 'none')
  check(
    'the groups are ordered project-first, then global',
    (await headings()).join(',') === 'Study guide,Mockup,Validators',
    (await headings()).join(' · '),
  )
  await page.keyboard.press('Escape')

  /* ---------------- the launcher below the rail breakpoint ---------------- */

  // The picker is rendered twice and CSS hides one copy. A ref to the rail's
  // first button was still a ref when that button was display:none, so the
  // narrow launcher opened with focus on <body> and J/K was dead.
  section('Launcher with the rail collapsed')
  await page.setViewportSize({ width: 960, height: 900 })
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="launcher"]')
  await page.waitForTimeout(150)

  const onLoad = () =>
    page.evaluate(() => {
      const a = document.activeElement
      return a instanceof HTMLElement && a.dataset.navItem !== undefined && a.offsetParent !== null
        ? a.textContent.trim()
        : `<${(a?.tagName ?? 'none').toLowerCase()}>`
    })
  check(
    'the first techdegree takes focus on load',
    (await onLoad()).startsWith('Front End Web Development'),
    await onLoad(),
  )

  // The pills were sized by their own text, so the row read as a staircase.
  const picker = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-testid="techdegree"]')].filter(
      (el) => el.offsetParent !== null,
    )
    const widths = items.map((el) => Math.round(el.getBoundingClientRect().width))
    return { count: items.length, widths, spread: Math.max(...widths) - Math.min(...widths) }
  })
  check(
    'every techdegree in the narrow picker is the same width',
    picker.count >= 3 && picker.spread <= 1,
    `widths ${picker.widths.join(', ')}`,
  )

  await page.keyboard.press('j')
  await page.waitForTimeout(80)
  check('J moves to the next one', (await onLoad()).startsWith('Full Stack JavaScript'))
  await page.keyboard.press('k')
  await page.waitForTimeout(80)
  check('and K comes back', (await onLoad()).startsWith('Front End Web Development'))

  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  check(
    'Enter opens it and hands focus to the first project',
    (await onLoad()).startsWith('05An Interactive Photo Gallery'),
    await onLoad(),
  )

  // Esc looked for the rail copy by name, so it did nothing at this width.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(80)
  check(
    'Esc comes back to the techdegree that opened them',
    (await onLoad()).startsWith('Front End Web Development'),
    await onLoad(),
  )
  await page.setViewportSize({ width: 1440, height: 900 })

  /* ---------------- ui scale ---------------- */

  section('UI scale')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  const sized = await page.evaluate(() => {
    const de = document.documentElement
    const rail = [...document.querySelectorAll('div')].find((d) =>
      d.className.includes('w-[260px]'),
    )
    return {
      zoom: getComputedStyle(de).zoom,
      railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
    }
  })
  // The sizes in the stylesheet are the real sizes. Nothing is scaled at
  // runtime, so a stray `zoom` creeping back in should fail here.
  check(
    'the UI is scaled in the styles, not by a runtime zoom',
    sized.zoom === '1' || sized.zoom === 'normal',
    `zoom = ${sized.zoom}`,
  )
  check('the section rail measures its scaled width', sized.railWidth === 260, `${sized.railWidth}px`)
  // The shell is height:100% with overflow:hidden, so a scale that the
  // viewport cannot absorb would clip the status bar or add a scrollbar.
  // `body` is overflow:hidden, so a page scrollbar can never actually appear
  // and documentElement.scrollHeight only reports content extent — it says
  // nothing about whether the scale fits. What matters is that the fixed
  // chrome is not pushed off the bottom: the status bar has to stay on screen.
  const fit = await page.evaluate(() => {
    const bars = [...document.getElementById('root').children].filter(
      (el) => el.getBoundingClientRect().height > 4,
    )
    const status = bars[bars.length - 1].getBoundingClientRect()
    return {
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      shellBottom: Math.round(document.body.getBoundingClientRect().bottom),
      statusBottom: Math.round(status.bottom),
      viewportH: window.innerHeight,
      bodyOverflow: getComputedStyle(document.body).overflowY,
    }
  })
  check('scaling adds no horizontal scrollbar', !fit.hScroll)
  check('the page itself never scrolls', fit.bodyOverflow === 'hidden', fit.bodyOverflow)
  check(
    'the shell still ends exactly at the viewport',
    Math.abs(fit.shellBottom - fit.viewportH) <= 1,
    `${fit.shellBottom} vs ${fit.viewportH}`,
  )
  check(
    'and the status bar is not pushed off the bottom',
    Math.abs(fit.statusBottom - fit.viewportH) <= 1,
    `${fit.statusBottom} vs ${fit.viewportH}`,
  )
  // Fixed-position overlays are the usual casualty of CSS zoom.
  await page.keyboard.press('Control+k')
  await page.waitForSelector('[role="dialog"]')
  const scrim = await page.evaluate(() => {
    const r = document.querySelector('[role="dialog"]').parentElement.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight }
  })
  check(
    'the command palette scrim still covers the viewport',
    scrim.w >= scrim.vw - 1 && scrim.h >= scrim.vh - 1,
    `${scrim.w}x${scrim.h} vs ${scrim.vw}x${scrim.vh}`,
  )
  await page.keyboard.press('Escape')

  /* ---------------- shortcut labels off a Mac ---------------- */

  // Every handler accepts metaKey OR ctrlKey, so the shortcuts always worked
  // on Windows — the labels were the part telling people to press a key their
  // keyboard does not have. A second context lies about the platform so both
  // spellings are covered from one machine.
  section('Shortcut labels on Windows')
  const winContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await winContext.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
    Object.defineProperty(navigator, 'userAgentData', { get: () => ({ platform: 'Windows' }) })
  })
  await winContext.route('**://*.api.sanity.io/**', async (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('query') ?? ''
    let result
    if (query.includes('_type == "techdegree"')) {
      result = INDEX
    } else {
      const id = JSON.parse(url.searchParams.get('$projectId') ?? '""')
      result = PROJECTS.find((p) => p._id === id) ?? null
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) })
  })
  const winPage = await winContext.newPage()

  await winPage.goto(BASE)
  await winPage.waitForSelector('[data-testid="launcher"]')
  await winPage.keyboard.press('?')
  await winPage.waitForSelector('[data-testid="shortcuts"]')
  check(
    'the shortcut sheet spells the modifier Ctrl+K',
    (await winPage.textContent('[data-testid="shortcuts"]')).includes('Ctrl+K'),
  )
  await winPage.keyboard.press('Escape')

  await winPage.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await winPage.waitForSelector('[data-testid="requirement"]')
  await winPage.keyboard.press('?')
  await winPage.waitForSelector('[data-testid="shortcuts"]')
  const winBody = await winPage.textContent('body')
  check('and reads Ctrl+Z / Ctrl+Enter for the rest', winBody.includes('Ctrl+Z') && winBody.includes('Ctrl+Enter'))
  check(
    'no Mac glyph survives anywhere on the page',
    !/[\u2318\u2303\u21b5]/.test(winBody),
    winBody.match(/.{0,20}[\u2318\u2303\u21b5].{0,20}/)?.[0] ?? '',
  )
  // The label changed; the binding must not have.
  await winPage.keyboard.press('Escape')
  await winPage.waitForTimeout(120)
  await winPage.keyboard.press('Control+Enter')
  await winPage.waitForTimeout(300)
  check('and Ctrl+Enter still works under the new label', winPage.url().endsWith('/send'))
  await winContext.close()

  /* ---------------- deploy config ---------------- */

  // `vite preview` serves index.html for unknown paths all by itself, so
  // nothing above this line can notice that a static host would 404 on
  // /review/<id>. Verified by hand against a plain static server: without
  // the rewrite a deep link is a 404, with it the app boots and keeps the
  // URL. This guards the config rather than the behaviour.
  section('Vercel deploy config')
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const spa = (vercel.rewrites ?? []).find((r) => r.destination === '/index.html')
  check('a rewrite sends unknown paths to index.html', Boolean(spa), JSON.stringify(vercel.rewrites))
  check(
    'and it catches every path, not just the root',
    spa && new RegExp(`^${spa.source}$`).test('/review/abc/send'),
    spa?.source,
  )
  const assetHeaders = (vercel.headers ?? []).find((h) => h.source.startsWith('/assets'))
  check(
    'hashed assets are cached immutably',
    assetHeaders?.headers.some((h) => /immutable/.test(h.value)),
  )

  /* ---------------- console ---------------- */

  section('Console')
  check('nothing threw and nothing warned', consoleErrors.length === 0, consoleErrors.join('\n      '))
  check(
    'every request the app made succeeded',
    failedRequests.length === 0,
    failedRequests.join('\n      '),
  )

  if (process.env.SHOTS) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(BASE)
    await page.waitForSelector('[data-testid="launcher"]')
    await page.screenshot({ path: `${process.env.SHOTS}/launcher.png` })
    await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
    await page.waitForSelector('[data-testid="requirement"]')
    await page.screenshot({ path: `${process.env.SHOTS}/grading.png` })
    await page.goto(`${BASE}/review/${GAME_SHOW_ID}/send`)
    await page.waitForSelector('text=Slack preview')
    await page.screenshot({ path: `${process.env.SHOTS}/send.png` })
  }

  await browser.close()
  server.kill()

  console.log(`\n${checks - failures}/${checks} checks passed`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
