import { expect, test, type Page } from '@playwright/test'

// Runs against the build made by scripts/build-engine-fixture.mjs: a full engine configured at
// http://127.0.0.1:4174 (scripts/serve-engine-fixture.mjs), a second origin like R2 would be.

const LEGAL = `[White "Legal"]
[Black "Saint Brie"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`

function watchForProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP ${e.violatedDirective} blocked ${e.blockedURI}`),
    )
    // Quick analysis keeps the full engine's test short.
    localStorage.setItem('chessreview.prefs', JSON.stringify({ preset: 'quick' }))
  })
  return problems
}

/** The engine choice lives in the settings panel. */
async function engineChoice(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  return page.getByRole('radiogroup', { name: 'Engine' })
}

test('downloads the accurate engine, checks it, keeps it, and reviews with it under the CSP', async ({
  page,
}) => {
  const problems = watchForProblems(page)
  await page.goto('/')
  const engine = await engineChoice(page)
  await expect(engine.getByRole('radio', { name: 'Standard' })).toBeChecked()
  // Not downloaded yet, so choosing it opens the download dialog instead of switching.
  await engine.getByRole('radio', { name: /^Accurate/ }).click()

  const dialog = page.getByRole('dialog', { name: 'Accurate engine' })
  await expect(dialog).toContainText('99 MB download')
  await dialog.getByRole('button', { name: /^Download/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60_000 })
  await expect(engine.getByRole('radio', { name: 'Accurate' })).toBeChecked()
  expect(await page.evaluate(() => caches.keys())).toEqual(['chessreview-engines-v1'])

  // The file is fetched once: reviewing does not download it again.
  const downloads: string[] = []
  page.on('request', (r) => r.url().endsWith('.wasm') && downloads.push(r.url()))
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(LEGAL)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
  await expect(page.locator('.acc-num').first()).toHaveText(/\d/)
  await page.getByRole('tab', { name: 'Report' }).click()
  await expect(page.getByText('Analysed by Stockfish 19 (accurate engine, full network)')).toBeVisible()
  expect(downloads.filter((u) => u.startsWith('http://127.0.0.1:4174'))).toEqual([])

  expect(problems).toEqual([])
})

test('refuses a download that does not match its checksum, and keeps the standard engine', async ({
  page,
}) => {
  watchForProblems(page)
  // The fixture server's copy with one byte flipped: the right size, the wrong fingerprint.
  await page.route('http://127.0.0.1:4174/stockfish-19-single.wasm', (route) =>
    route.continue({ url: 'http://127.0.0.1:4174/tampered.wasm' }),
  )
  await page.goto('/')
  await (await engineChoice(page)).getByRole('radio', { name: /^Accurate/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Accurate engine' })
  await dialog.getByRole('button', { name: /^Download/ }).click()
  await expect(dialog.getByRole('alert')).toHaveText(/did not match its checksum/, { timeout: 60_000 })
  await dialog.getByRole('button', { name: 'Keep the standard engine' }).click()
  await expect(
    page.getByRole('radiogroup', { name: 'Engine' }).getByRole('radio', { name: 'Standard' }),
  ).toBeChecked()
  expect(await page.evaluate(async () => (await caches.open('chessreview-engines-v1')).keys())).toHaveLength(
    0,
  )
})

test('the standard build offers no engine choice and keeps its CSP', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:4173/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Engine' })).toHaveCount(0)
  // Compare the sources connect-src allows, so other origins the app talks to don't matter here.
  const connectSrc = async (url: string) => {
    const csp = (await request.get(url)).headers()['content-security-policy'] ?? ''
    return csp.match(/connect-src ([^;]*)/)?.[1]?.split(' ') ?? []
  }
  const standard = await connectSrc('http://127.0.0.1:4173/')
  expect(standard).toContain("'self'")
  expect(standard).not.toContain('http://127.0.0.1:4174')
  expect(standard).not.toContain('blob:')
  // The full build allows exactly two more: the engine's origin and the blob: it is handed over as.
  expect((await connectSrc('/')).sort()).toEqual([...standard, 'http://127.0.0.1:4174', 'blob:'].sort())
})
