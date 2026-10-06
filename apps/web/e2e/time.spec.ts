import { expect, test, type Page } from '@playwright/test'

// A bullet game with clock comments, as chess.com and Lichess export them.
const TIMED = `[White "Ann"]
[Black "Bob"]
[Result "*"]
[TimeControl "60+1"]

1. e4 {[%clk 0:01:00]} e5 {[%clk 0:00:58]} 2. Nf3 {[%clk 0:00:51]} Nc6 {[%clk 0:00:20]} 3. Bb5 {[%clk 0:00:41]} a6 {[%clk 0:00:04]} 4. Ba4 {[%clk 0:00:40]} b5 {[%clk 0:00:04]} *`

async function review(page: Page, pgn: string) {
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(pgn)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
}

test('shows think time per move and clock use for both players', async ({ page }) => {
  await review(page, TIMED)
  await page.getByRole('button', { name: /^Nc6/ }).click()
  await expect(page.locator('.comment')).toContainText('Took 39 s, 0:20 left.')
  await page.getByRole('button', { name: /^b5/ }).click()
  await expect(page.locator('.comment')).toContainText('Took 1.0 s, 0:04 left, in time trouble.')

  await page.getByRole('tab', { name: 'Report' }).click()
  await expect(page.getByRole('heading', { name: 'Time' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Both clocks over the game/ })).toBeVisible()
  const row = (name: string) => page.getByRole('row', { name: new RegExp(`^${name}`) })
  await expect(row('Longest think')).toContainText('39 s, 2… Nc6')
  await expect(row('Moves in time trouble')).toContainText('0')
  await expect(row('Moves in time trouble')).toContainText('1')
  await expect(page.getByText('Time trouble means under 0:06 on the clock')).toBeVisible()
})

test('says so when a PGN has no clocks', async ({ page }) => {
  await review(page, '[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *')
  await page.getByRole('tab', { name: 'Report' }).click()
  await expect(page.getByText('This game’s PGN has no clock times')).toBeVisible()
  await page.getByRole('tab', { name: 'Moves' }).click()
  await page.getByRole('button', { name: /^Nf3/ }).click()
  await expect(page.locator('.comment')).not.toContainText('left.')
})
