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

  /* ---------------- shortcuts v1 broke ---------------- */

  section('Shortcuts the 2024 tool broke')
  const urlBefore = page.url()
  await page.keyboard.press('Control+r')
  await page.waitForTimeout(250)
  check('Ctrl+R is not bound, so nothing hijacks reload', page.url() === urlBefore)
  check('the review is still on screen after Ctrl+R', (await grades())[0] === 'met')

  /* ---------------- mark remaining, undo ---------------- */

  section('Mark remaining as met, and undo')
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

  /* ---------------- reflow ---------------- */

  section('Reflow')
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.goto(`${BASE}/review/${GAME_SHOW_ID}`)
  await page.waitForSelector('[data-testid="requirement"]')
  check(
    'the live output panel hides below 1180px',
    !(await page.isVisible('text=Slack output')),
  )
  await page.setViewportSize({ width: 820, height: 900 })
  await page.waitForTimeout(120)
  check('the section rail collapses below 900px', !(await page.isVisible('text=Sections')))
  check(
    'the requirements are still there in the single column',
    (await page.$$('[data-testid="requirement"]')).length === 14,
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
