import { expect, test } from '@playwright/test'

const game = (white: string, black: string, moves: string, result: string) =>
  `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[Date "2026.09.0${moves.length % 9}"]\n[TimeControl "600"]\n\n${moves} ${result}`

const LEGAL = game(
  'Morphy',
  'Saint Brie',
  '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#',
  '1-0',
)
const MATE = game('Anderssen', 'Morphy', '1. f3 e5 2. g4 Qh4#', '0-1')

test('says what insights are for before any game is reviewed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Insights' }).click()
  await expect(page.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible()
  await expect(page.getByText('No reviewed games on this device yet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review a game' })).toHaveAttribute('href', '#/')
})

test('sums up a player’s reviewed games, from this device only', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  for (const pgn of [LEGAL, MATE]) {
    await page.goto('/')
    await page.getByText('Paste a PGN instead').click()
    await page.getByLabel('PGN').fill(pgn)
    await page.getByRole('button', { name: 'Review PGN' }).click()
    await expect(page.locator('.review')).toBeVisible()
  }
  await page.goto('/#/insights')
  await expect(page.getByLabel('Player')).toHaveValue('Morphy') // the player in both games
  await expect(page.getByText('2 games reviewed.')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Accuracy in 2 games/ })).toBeVisible()
  const times = page.getByRole('table').last()
  await expect(times).toContainText('Rapid')
  await expect(times).toContainText('2 / 0 / 0') // won both
  // Switching player re-reads the games from that side.
  await page.getByLabel('Player').selectOption('Saint Brie')
  await expect(page.getByText('1 game reviewed.')).toBeVisible()
  await expect(page.getByRole('table').last()).toContainText('0 / 0 / 1')
  expect(problems).toEqual([])
})
