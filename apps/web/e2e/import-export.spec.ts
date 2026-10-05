import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const LEGAL = `[White "Legal"]\n[Black "Saint Brie"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`
const FOOLS = `[White "Saint Brie"]\n[Black "Legal"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`

function watchForProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP ${e.violatedDirective} blocked ${e.blockedURI}`),
    )
  })
  return problems
}

/** Lichess's games export, as ndjson; the real API sends Access-Control-Allow-Origin: *. */
async function mockLichess(page: Page) {
  await page.route('https://lichess.org/api/games/user/**', (route) => {
    const game = (id: string, pgn: string, lastMoveAt: number, winner: string) => ({
      id,
      variant: 'standard',
      speed: 'rapid',
      status: 'mate',
      createdAt: lastMoveAt - 60_000,
      lastMoveAt,
      winner,
      clock: { initial: 600, increment: 0 },
      players: {
        white: { user: { name: pgn === LEGAL ? 'Legal' : 'Saint Brie' } },
        black: { user: { name: pgn === LEGAL ? 'Saint Brie' : 'Legal' } },
      },
      pgn,
    })
    return route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      headers: { 'access-control-allow-origin': '*' },
      body: [
        game('legal001', LEGAL, 1_790_000_000_000, 'white'),
        game('fools001', FOOLS, 1_790_100_000_000, 'black'),
      ]
        .map((g) => JSON.stringify(g))
        .join('\n'),
    })
  })
}

test('lists Lichess games and reviews them all in a queue that survives a reload', async ({ page }) => {
  const problems = watchForProblems(page)
  await mockLichess(page)
  await page.goto('/')
  await page.getByLabel('Lichess').check()
  await page.getByLabel('Lichess username').fill('Legal')
  await page.getByRole('button', { name: 'Load games' }).click()
  await expect(page.locator('.gamerow')).toHaveCount(2)
  await expect(page.locator('.gamerow').first()).toContainText('Won')

  await page.getByRole('button', { name: 'Review all 2 new games' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Reviewing' })).toBeVisible()
  await page.reload() // mid-batch: the queue picks up where it was
  await expect(page.locator('.gamerow .g-action')).toHaveText(['Open', 'Open'], { timeout: 90_000 })
  await expect(page.locator('.queuebar')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('exports a review as annotated PGN and as a file that opens on another device', async ({
  page,
  browser,
}) => {
  watchForProblems(page)
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(LEGAL)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
  await page.getByRole('tab', { name: 'Report' }).click()

  const pgnDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Annotated PGN' }).click()
  const pgn = readFileSync(await (await pgnDownload).path(), 'utf8')
  expect((await pgnDownload).suggestedFilename()).toBe('Legal-vs-Saint-Brie.pgn')
  expect(pgn).toContain('[Annotator "chessreview"]')
  expect(pgn.replace(/\s+/g, ' ')).toMatch(
    /Bxd1 \$4 \{ \[%eval [^\]]+\] Blunder: gave up \d+% of win chance\./,
  )

  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Review file' }).click()
  const file = await (await jsonDownload).path()

  // Another device: a fresh browser profile with nothing stored.
  const other = await browser.newContext()
  const fresh = await other.newPage()
  const problems = watchForProblems(fresh)
  await fresh.goto('/')
  await fresh.getByText('Open a review file').click()
  await fresh.getByLabel('Review file').setInputFiles(file)
  await expect(fresh.locator('.review')).toBeVisible()
  await expect(fresh.getByRole('heading', { level: 1 })).toHaveText('Legal vs Saint Brie')
  expect(problems).toEqual([])
  await other.close()
})

test('refuses a file that is not a review, and says why', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Open a review file').click()
  await page.getByLabel('Review file').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"other"}'),
  })
  await expect(page.getByRole('alert')).toHaveText(
    'That review file can’t be used: it is not a chessreview review.',
  )
})
