/* global document, window -- used inside page.evaluate(), which runs in the browser */
// Regenerates the README screenshots in docs/screenshots from the production build.
//   pnpm build && pnpm screenshots
// chess.com is mocked with five real games from the golden fixtures; the reviews are made by the real
// engine in the browser, so every picture is the actual product.
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { start } from './serve-dist.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const { chromium } = createRequire(`${root}apps/web/package.json`)('@playwright/test')
const out = `${root}docs/screenshots`
mkdirSync(out, { recursive: true })

const fixture = (n) => JSON.parse(readFileSync(`${root}packages/core/test/fixtures/${n}.json`, 'utf8')).pgn
const real = [
  'chesscom-blitz-mate',
  'chesscom-bullet',
  'chesscom-long-endgame',
  'chesscom-promotion',
  'chesscom-draw',
].map(fixture)
const opponents = [
  'demon64fields',
  'Narek_Ghimoyan',
  'BerlinNoMercy',
  'Suleyman_Chess06',
  'laijfer',
  'subham777',
  'Bryanl106',
  'wonderfultime',
]
const filler = opponents
  .slice(5)
  .map((o, i) => `[White "Hikaru"]\n[Black "${o}"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 ${i + 3}. d4 *`)
const games = [...real, ...filler].map((pgn, i) => {
  const white = i % 2 === 0
  const result = pgn.match(/\[Result "([^"]+)"\]/)?.[1] ?? '1-0'
  const won = result === '1-0' ? white : result === '0-1' ? !white : null
  const outcome = (mine) => (won === null ? 'agreed' : mine === won ? 'win' : 'resigned')
  return {
    url: `https://www.chess.com/game/live/${1000 + i}`,
    pgn,
    rules: 'chess',
    time_class: ['blitz', 'bullet', 'blitz', 'rapid', 'blitz'][i % 5],
    time_control: ['180', '60', '180', '600+5', '180+2'][i % 5],
    end_time: 1_790_000_000 - i * 5400,
    white: {
      username: white ? 'Hikaru' : opponents[i],
      rating: white ? 3201 : 2800 + i * 17,
      result: outcome(white),
    },
    black: {
      username: white ? opponents[i] : 'Hikaru',
      rating: white ? 2800 + i * 17 : 3201,
      result: outcome(!white),
    },
  }
})

const server = await start()
const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
await page.addInitScript((p) => localStorage.setItem('chessreview.prefs', JSON.stringify(p)), {
  theme: 'light',
  board: 'slate',
  preset: 'quick',
})
await page.route('https://api.chess.com/**', (route) => {
  const headers = { 'access-control-allow-origin': '*' }
  if (route.request().url().endsWith('/games/archives'))
    return route.fulfill({
      json: { archives: ['https://api.chess.com/pub/player/hikaru/games/2026/10'] },
      headers,
    })
  return route.fulfill({ json: { games }, headers })
})
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` })
const theme = (t) => page.evaluate((v) => (document.documentElement.dataset.theme = v), t)

await page.goto('http://127.0.0.1:4173/')
await page.waitForTimeout(500)
await shot('home')

await page.getByLabel(/username/i).fill('hikaru')
await page.getByRole('button', { name: /load games/i }).click()
await page.locator('.gamerow').first().waitFor({ timeout: 60_000 })
for (let i = 0; i < 4; i++) {
  await page.locator('.gamerow').nth(i).click()
  await page.locator('.review').waitFor({ timeout: 180_000 })
  if (i === 0) {
    await page.getByRole('button', { name: 'Next mistake' }).click()
    await page.waitForTimeout(400)
    await shot('review')
    await page.getByRole('tab', { name: 'Report' }).click()
    await page.waitForTimeout(300)
    await shot('report')
  }
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Games' }).click()
  await page.locator('.gamerow').first().waitFor()
}
await page.mouse.move(0, 0)
await shot('games')

await page.getByRole('button', { name: 'Settings' }).click()
await page.waitForTimeout(250)
await shot('settings')
await page.keyboard.press('Escape')

await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Insights' }).click()
await page.getByText('Accuracy over time').waitFor()
await page.mouse.move(0, 0)
await page.waitForTimeout(600)
await shot('insights')

// the same review in the dark theme, and on a phone
await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Games' }).click()
await page.locator('.gamerow').first().click()
await page.locator('.review').waitFor()
await page.getByRole('button', { name: 'Next mistake' }).click()
await theme('dark')
await page.waitForTimeout(300)
await shot('review-dark')
await theme('light')
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(300)
await page.evaluate(() => window.scrollTo(0, 0))
await shot('review-mobile')

await browser.close()
server.close()
console.log(`screenshots written to docs/screenshots`)
