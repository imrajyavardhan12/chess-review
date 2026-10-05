import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const SHORT = `[White "Légal"]
[Black "Saint Brie"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6 5.Nxe5 Bxd1 6.Bxf7+ Ke7 7.Nd5# 1-0`

const SW = fileURLToPath(new URL('../dist/sw.js', import.meta.url))

test.use({ serviceWorkers: 'allow' })

function watchForProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  return problems
}

/** Waits until the service worker has cached the app and controls the page. */
async function untilControlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

test('reviews a pasted PGN with no network, once the app has been opened', async ({ page, context }) => {
  const problems = watchForProblems(page)
  await page.goto('/')
  await untilControlled(page)

  await context.setOffline(true)
  await page.reload()
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(SHORT)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Légal vs Saint Brie')
  await expect(page.locator('.title p')).toContainText('C41') // opening data came from the cache too

  // Requests to other origins are not answered from the cache: chess.com still needs the network.
  await page.goto('/')
  await page.getByLabel('chess.com username').fill('someone')
  await page.getByRole('button', { name: 'Load games' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(
    problems.filter((p) => !p.includes('api.chess.com') && !p.includes('ERR_INTERNET_DISCONNECTED')),
  ).toEqual([])
})

test('offers a new version without swapping it in, and switches on reload', async ({ page }) => {
  await page.goto('/')
  await untilControlled(page)
  const first = await page.evaluate(() => caches.keys())
  expect(first).toEqual([expect.stringMatching(/^chessreview-shell-[0-9a-f]{16}$/)])

  // Deploy a "new version": same files, a different version.
  const original = readFileSync(SW, 'utf8')
  try {
    writeFileSync(SW, original.replace(/^const VERSION = ".*"$/m, 'const VERSION = "next"'))
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update())
    await expect(page.getByRole('status').filter({ hasText: 'A new version' })).toBeVisible()
    // Until the user asks, the old version keeps serving this tab.
    expect(await page.evaluate(() => caches.keys())).toContain(first[0])

    const reloaded = page.waitForEvent('load')
    await page.getByRole('button', { name: 'Reload' }).click()
    await reloaded
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['chessreview-shell-next'])
    await expect(page.getByRole('status').filter({ hasText: 'A new version' })).toHaveCount(0)
    await expect(page.getByLabel('chess.com username')).toBeVisible()
  } finally {
    writeFileSync(SW, original)
  }
})
