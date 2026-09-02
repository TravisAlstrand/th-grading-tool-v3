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
  await page.waitForSelector('h1')
  check(
    'techdegree rail lists the techdegrees from the index query',
    (await page.textContent('body')).includes('Full Stack JavaScript'),
  )
  check(
    'project table shows real requirement counts',
    (await page.textContent('body')).includes('Game Show App'),
  )

  /* ---------------- command palette ---------------- */

  section('⌘K searches every project across every techdegree')
  await page.keyboard.press('Control+k')
  await page.waitForSelector('[role="dialog"]')
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
  await page.waitForSelector('h1')
  check('the launcher offers the draft to resume', (await page.textContent('body')).includes('Resume'))
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
  check('its note is shown with it', body.includes('Only 3 phrases, and 2 contain digits.'))

  await page.click('text=Copy to clipboard')
  await page.waitForTimeout(300)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  check('copy writes the Slack-formatted review', clipboard.includes(':needs-work:'))
  check('exceeds requirements carry the exceeds marker', clipboard.includes(':exceeds:'))
  check('the note is quoted', clipboard.includes('> Only 3 phrases, and 2 contain digits.'))
  check('met items are grouped before flagged ones', clipboard.indexOf(':meets:') < clipboard.indexOf(':needs-work:'))
  check('copying leaves the review exactly where it was', page.url().endsWith('/send'))
  check(
    'and does not reload the page',
    (await page.textContent('body')).includes('Only 3 phrases, and 2 contain digits.'),
  )

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
  await page.waitForSelector('h1')
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
  await page.waitForSelector('h1')
  check(
    'and on the launcher too',
    (await page.$$('[data-testid="theme-toggle"]:visible')).length === 1,
  )

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
  const fit = await page.evaluate(() => {
    const de = document.documentElement
    return {
      vScroll: de.scrollHeight > de.clientHeight + 1,
      hScroll: de.scrollWidth > de.clientWidth + 1,
      shellBottom: Math.round(document.body.getBoundingClientRect().bottom),
      viewportH: window.innerHeight,
    }
  })
  check('scaling adds no vertical scrollbar', !fit.vScroll)
  check('scaling adds no horizontal scrollbar', !fit.hScroll)
  check(
    'the shell still ends exactly at the viewport',
    Math.abs(fit.shellBottom - fit.viewportH) <= 1,
    `${fit.shellBottom} vs ${fit.viewportH}`,
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
  await winPage.waitForSelector('h1')
  check('the launcher spells the modifier Ctrl+K', (await winPage.textContent('kbd')) === 'Ctrl+K')

  await winPage.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await winPage.waitForSelector('[data-testid="requirement"]')
  const winBody = await winPage.textContent('body')
  check('the status bar reads Ctrl+Z / Ctrl+K / Ctrl+Enter', winBody.includes('Ctrl+Z undo'))
  check(
    'no Mac glyph survives anywhere on the page',
    !/[\u2318\u2303\u21b5]/.test(winBody),
    winBody.match(/.{0,20}[\u2318\u2303\u21b5].{0,20}/)?.[0] ?? '',
  )
  // The label changed; the binding must not have.
  await winPage.keyboard.press('Control+Enter')
  await winPage.waitForTimeout(300)
  check('and Ctrl+Enter still works under the new label', winPage.url().endsWith('/send'))
  await winContext.close()

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
    await page.waitForSelector('h1')
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
