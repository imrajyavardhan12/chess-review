import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const GAME =
  '[White "Morphy"]\n[Black "Saint Brie"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0'

// After 1. e4 e5 2. Bc4 Nc6 3. Qh5 d6, White has Qxf7# and, in the game, played Nf3 instead.
const PUZZLE = {
  id: 'morphy|test-position',
  player: 'morphy',
  gameId: 'game',
  opponent: 'Saint Brie',
  date: '2026-10-01',
  tactic: null,
  checkedWith: { depth: 18, nodes: 3_000_000 },
  puzzle: {
    moveIndex: 6,
    fen: 'r1bqkbnr/ppp2ppp/2np4/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4',
    color: 'w',
    solution: 'h5f7',
    solutionSan: 'Qxf7#',
    line: ['h5f7'],
    playedUci: 'g1f3',
    playedSan: 'Nf3',
    label: 'Miss',
    loss: 31,
    winBefore: 80,
    phase: 'opening',
    bestWin: 100,
    gap: 25,
  },
  progress: { box: 0, due: 0, attempts: 0, solved: 0, lastAt: null },
}

/** Reviews a game through the page, so a player exists, then plants a puzzle in the browser's storage. */
async function withPuzzle(page: Page) {
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(GAME)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chessreview')
        open.onerror = () => reject(open.error ?? new Error('could not open the database'))
        open.onsuccess = () => {
          const tx = open.result.transaction('puzzles', 'readwrite')
          tx.objectStore('puzzles').put(record)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('could not save the puzzle'))
        }
      }),
    PUZZLE,
  )
}

test('says puzzles come from your own games before any is reviewed', async ({ page }) => {
  await page.goto('/#/train')
  await expect(page.getByRole('heading', { name: 'Train', level: 1 })).toBeVisible()
  await expect(page.getByText('Puzzles come from your own mistakes')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review some of your games' })).toHaveAttribute('href', '#/')
})

test('asks a puzzle, takes a typed answer, and counts only the first try', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  await withPuzzle(page)
  await page.getByRole('link', { name: 'Train' }).click()

  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  await expect(page.getByText('from your game against Saint Brie on 2026-10-01')).toBeVisible()

  // Typing something that is not a move explains how to write one.
  await page.getByLabel('Your move').fill('hello')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('That is not a legal move here.')).toBeVisible()

  // The move played in the game was the mistake, and the page says so.
  await page.getByLabel('Your move').fill('Nf3')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(
    page.getByText('That is the move you played in the game, and it was the mistake.'),
  ).toBeVisible()

  // Trying again with the right move solves it, and shows what happened in the game.
  await page.getByLabel('Your move').fill('Qxf7')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()
  await expect(page.getByText('In the game you played')).toContainText('Nf3')
  await expect(page.locator('.train-line')).toContainText('4. Qxf7#')
  await expect(page.getByRole('link', { name: 'Open the game' })).toHaveAttribute(
    'href',
    '#/review/game?u=morphy',
  )

  // The first answer was wrong, so the puzzle does not count as solved first try.
  await expect(page.getByText('Solved first try').locator('..')).toContainText('0%')

  await page.getByRole('button', { name: 'Next puzzle' }).click()
  await expect(page.getByText('You have answered everything that is due.')).toBeVisible()
  expect(problems).toEqual([])

  // The answer is saved: after a reload the puzzle is waiting for later, not new.
  await page.reload()
  await expect(page.getByText('1 puzzle will come back later')).toBeVisible()
})

test('shows the answer on request and the page has no WCAG A/AA violations', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  const asking = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(asking.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  await page.getByRole('button', { name: 'Show the answer' }).click()
  await expect(page.getByRole('heading', { name: 'The best move' })).toBeVisible()
  const shown = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(shown.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
})

test('the header, with its navigation, fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  for (const route of ['/', '/#/insights', '/#/train']) {
    await page.goto(route)
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  // The name is hidden on a phone, but the link keeps it for screen readers.
  await expect(page.getByRole('link', { name: 'chessreview' })).toBeVisible()
})
