import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const OPERA = `[White "Morphy"]
[Black "Duke of Brunswick"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`

/** Fails with a readable list of WCAG 2.1 A/AA violations on the page as it is now. */
async function expectAccessible(page: Page, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const found = results.violations.map(
    (v) =>
      `${where}: ${v.id} (${v.impact}) ${v.help} — ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 4)
        .join(' | ')}`,
  )
  expect(found).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (t) => localStorage.setItem('chessreview.prefs', JSON.stringify({ theme: t })),
        theme,
      )
    })

    test('the home page and the review screens have no WCAG A/AA violations', async ({ page }) => {
      await page.goto('/')
      await expectAccessible(page, 'home')
      await page.getByText('Paste a PGN instead').click()
      await expectAccessible(page, 'home with the PGN box open')
      await page.getByLabel('PGN').fill(OPERA)
      await page.getByRole('button', { name: 'Review PGN' }).click()
      await expect(page.locator('.review')).toBeVisible()
      await expectAccessible(page, 'review, start')
      await page.getByRole('button', { name: /^Rxd7/ }).first().click()
      await expectAccessible(page, 'review, a move')
      await page.getByRole('tab', { name: 'Report' }).click()
      await expectAccessible(page, 'report')
    })

    test('the settings panel has no WCAG A/AA violations', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Settings' }).click()
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
      await expectAccessible(page, 'settings panel')
    })

    test('the error and progress screens have no WCAG A/AA violations', async ({ page }) => {
      // Hold every engine search until the progress screen has been checked.
      await page.addInitScript(() => {
        const send = Object.getOwnPropertyDescriptor(Worker.prototype, 'postMessage')!.value as (
          this: Worker,
          ...args: unknown[]
        ) => void
        const held: [Worker, unknown][] = []
        let holding = true
        Worker.prototype.postMessage = function (this: Worker, message: unknown) {
          if (holding && typeof message === 'string' && message.startsWith('go ')) held.push([this, message])
          else send.call(this, message)
        }
        ;(window as unknown as { release: () => void }).release = () => {
          holding = false
          for (const [w, m] of held) send.call(w, m)
        }
      })
      await page.goto('/#/review/0123456789abcdef')
      await expect(page.getByRole('alert')).toBeVisible()
      await expectAccessible(page, 'missing review')

      await page.goto('/')
      await page.getByText('Paste a PGN instead').click()
      await page.getByLabel('PGN').fill(OPERA)
      await page.getByRole('button', { name: 'Review PGN' }).click()
      await expect(page.locator('.progress')).toBeVisible()
      await expectAccessible(page, 'progress')
      await page.evaluate(() => (window as unknown as { release: () => void }).release())
      await expect(page.locator('.review')).toBeVisible()
    })

    test('the games list has no WCAG A/AA violations', async ({ page }) => {
      await page.route('https://api.chess.com/**', (route) =>
        route.fulfill({
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(
            route.request().url().endsWith('/archives')
              ? { archives: ['https://api.chess.com/pub/player/morphy/games/2026/09'] }
              : {
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
                },
          ),
        }),
      )
      await page.goto('/')
      await page.getByLabel('chess.com username').fill('morphy')
      await page.getByRole('button', { name: 'Load games' }).click()
      await expect(page.locator('.gamerow').first()).toContainText('Duke')
      await expectAccessible(page, 'games list')
    })
  })
}

test('the settings panel opens from the keyboard, changes things, and Escape closes it and returns focus', async ({
  page,
}) => {
  await page.goto('/')
  const gear = page.getByRole('button', { name: 'Settings' })
  await gear.focus()
  await page.keyboard.press('Enter')
  await expect(gear).toHaveAttribute('aria-expanded', 'true')

  // The choices are real radios: arrow keys move between them and apply immediately.
  const theme = page.getByRole('radiogroup', { name: 'Theme' })
  await theme.getByRole('radio', { name: 'Dark' }).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
  await expect(gear).toBeFocused()
  await expect(gear).toHaveAttribute('aria-expanded', 'false')
})

test('a game can be reviewed with the keyboard alone, with focus always visible', async ({ page }) => {
  const focusVisible = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return !!el && el !== document.body && getComputedStyle(el).outlineStyle !== 'none'
    })

  await page.goto('/')
  await page.locator('summary', { hasText: 'Paste a PGN instead' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('PGN')).toBeFocused()
  await page.keyboard.insertText(OPERA)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Review PGN' })).toBeFocused()
  expect(await focusVisible()).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.locator('.review')).toBeVisible()

  // Arrow keys step through the game.
  await page.keyboard.press('End')
  const current = page.locator('.mcell[aria-current="true"]')
  await expect(current).toContainText('Rd8#')
  await page.keyboard.press('ArrowLeft')
  await expect(current).toContainText('Nxb8')

  // The tabs follow the ARIA pattern: one tab stop, arrows switch between them.
  await page.getByRole('tab', { name: 'Moves' }).focus()
  expect(await focusVisible()).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Report' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Report' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('Move quality')
  await page.getByRole('tab', { name: 'Report' }).press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Moves' })).toBeFocused()
  await expect(current).toContainText('Nxb8') // the arrows switched tabs, not moves
})
