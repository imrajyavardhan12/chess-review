import { expect, test, type Page, type Route } from '@playwright/test'

const OPERA = `[White "Morphy"]
[Black "Duke of Brunswick"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`

/** Fails a test on any console error or Content-Security-Policy violation. */
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

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  })

async function mockChessCom(page: Page) {
  await page.route('https://api.chess.com/**', (route) => {
    const url = route.request().url()
    if (url.includes('/nobody-here/')) return json(route, { code: 0, message: 'not found' }, 404)
    if (url.endsWith('/games/archives'))
      return json(route, { archives: ['https://api.chess.com/pub/player/morphy/games/2026/09'] })
    return json(route, {
      games: [
        {
          url: 'https://www.chess.com/game/live/1',
          pgn: OPERA,
          rules: 'chess',
          time_class: 'rapid',
          time_control: '600',
          end_time: 1_790_000_000,
          white: { username: 'Morphy', rating: 2500, result: 'win' },
          black: { username: 'Duke', rating: 1200, result: 'resigned' },
        },
      ],
    })
  })
}

const engineRequests = (page: Page) => {
  const seen: string[] = []
  page.on('request', (r) => r.url().includes('/engine/') && seen.push(r.url()))
  return seen
}

test('reviews a pasted PGN entirely in the browser, under the production CSP', async ({ page }) => {
  const problems = watchForProblems(page)
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(OPERA)
  await page.getByRole('button', { name: 'Review PGN' }).click()

  await expect(page.locator('.review')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morphy vs Duke of Brunswick')
  await expect(page.locator('.title p')).toContainText('C41')

  const [white, black] = (await page.locator('.acc-num').allTextContents()).map(Number)
  expect(white).toBeGreaterThan(95) // Morphy played an almost perfect game
  expect(black).toBeLessThan(90)

  // Stepping to the queen sacrifice (16.Qb8+) shows it as the best move.
  await page.keyboard.press('End')
  await page.getByRole('tab', { name: 'Report' }).click()
  await expect(page.getByText('Move quality')).toBeVisible()
  await expect(page.locator('.rtable').first().locator('tbody tr')).toHaveCount(10)

  expect(problems).toEqual([])
})

test('lists games from chess.com, then reopens a stored review without running the engine again', async ({
  page,
}) => {
  const problems = watchForProblems(page)
  await mockChessCom(page)
  const engine = engineRequests(page)

  await page.goto('/')
  await page.getByLabel('chess.com username').fill('morphy')
  await page.getByRole('button', { name: 'Load games' }).click()
  const row = page.locator('.gamerow').first()
  await expect(row).toContainText('Duke')
  await expect(row).toContainText('Won')
  await expect(row.locator('.g-action')).toHaveText('Review')

  await row.click()
  await expect(page.locator('.review')).toBeVisible()
  expect(engine.length).toBeGreaterThan(0)

  // Back to the list: the game is now marked as reviewed, with the player's accuracy.
  await page.getByRole('link', { name: 'Games' }).click()
  await expect(page.locator('.gamerow').first().locator('.g-action')).toHaveText('Open')
  await expect(page.locator('.gamerow').first().locator('.g-acc')).toContainText('%')

  // The review survives a reload and opens instantly: it is read from IndexedDB, not recomputed.
  const before = engine.length
  await page.locator('.gamerow').first().click()
  await expect(page.locator('.review')).toBeVisible()
  await page.reload()
  await expect(page.locator('.review')).toBeVisible()
  expect(engine.length).toBe(before)

  expect(problems).toEqual([])
})

test('says what went wrong for a PGN it cannot read', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill('1. e4 e5 2. Nf3 Nc6 3. Rxd8 *')
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.getByRole('alert')).toContainText('couldn’t be read')
  await expect(page.locator('.review')).toHaveCount(0)
})

test('says what went wrong for an unknown chess.com user', async ({ page }) => {
  await mockChessCom(page)
  await page.goto('/')
  await page.getByLabel('chess.com username').fill('nobody-here')
  await page.getByRole('button', { name: 'Load games' }).click()
  await expect(page.getByRole('alert')).toContainText('no player named')
})

test('a review link opened where it was never made explains itself', async ({ page }) => {
  await page.goto('/#/review/0123456789abcdef')
  await expect(page.getByRole('alert')).toContainText('isn’t on this device')
})
