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
  tactic: 'pin' as string | null,
  perspective: undefined as 'allowed' | 'missed' | null | undefined,
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
async function withPuzzle(page: Page, extra: (typeof PUZZLE)[] = []) {
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
          for (const r of record) tx.objectStore('puzzles').put(r)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('could not save the puzzle'))
        }
      }),
    [PUZZLE, ...extra],
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

  // Today's set counts it, and says so once nothing is left.
  await expect(page.getByText('1 of 1 today · done for today')).toBeVisible()

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

test('shows how far today’s set is, and counts it up as puzzles are answered', async ({ page }) => {
  const other = { ...PUZZLE, id: 'morphy|second', tactic: 'fork', puzzle: { ...PUZZLE.puzzle, loss: 20 } }
  await withPuzzle(page, [other])
  await page.goto('/#/train')
  await expect(page.getByText('0 of 2 today')).toBeVisible()
  await page.getByRole('button', { name: 'Show the answer' }).first().click()
  await page.getByRole('button', { name: 'Next puzzle' }).click()
  await expect(page.getByText('1 of 2 today')).toBeVisible()
})

test('practises one tactic when a link asks for it, and says when it has none', async ({ page }) => {
  const other = { ...PUZZLE, id: 'morphy|second', tactic: 'fork' }
  await withPuzzle(page, [other])

  await page.goto('/#/train?tactic=fork')
  await expect(page.getByText('Focus: Forks · 1 puzzle')).toBeVisible()
  await expect(page.getByText('0 of 2 today')).toBeVisible() // the day's set is not narrowed by the focus
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  await page.getByRole('button', { name: 'Show the answer' }).first().click()
  await page.getByRole('button', { name: 'Next puzzle' }).click()
  await expect(page.getByText('You have answered everything that is due.')).toBeVisible()

  // Another tactic has no puzzles yet, and the way back to all of them is on the page.
  await page.goto('/#/train?tactic=skewer')
  await expect(page.getByText('No puzzles for “Skewers” yet.')).toBeVisible()
  await page.getByRole('link', { name: 'Show all puzzles' }).first().click()
  await expect(page.getByText('Focus:')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
})

test('a puzzle fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await withPuzzle(page)
  await page.goto('/#/train?tactic=pin')
  await expect(page.getByLabel('Your move')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('a tactic in the link that is not a real one shows an empty focus, not a broken page', async ({
  page,
}) => {
  await withPuzzle(page)
  for (const odd of ['constructor', '__proto__', 'someNewTactic']) {
    await page.goto(`/#/train?tactic=${odd}`)
    await expect(page.getByRole('link', { name: 'Show all puzzles' }).first()).toBeVisible()
    await expect(page.getByText('Focus:')).toBeVisible()
  }
  await page.goto('/#/train?tactic=')
  await expect(page.getByText('Focus:')).toHaveCount(0)
})

test('opens for the player named in the link', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train?tactic=pin&u=Morphy')
  await expect(page.getByLabel('Player')).toHaveValue('Morphy')
})

test('practises the side of a tactic the link asks for', async ({ page }) => {
  const allowed = { ...PUZZLE, id: 'morphy|allowed', tactic: 'fork', perspective: 'allowed' as const }
  const missed = { ...PUZZLE, id: 'morphy|missed', tactic: 'fork', perspective: 'missed' as const }
  await withPuzzle(page, [allowed, missed])

  await page.goto('/#/train?tactic=fork&p=missed')
  await expect(page.getByText('Focus: Missed a fork · 1 puzzle')).toBeVisible()
  await page.goto('/#/train?tactic=fork&p=allowed')
  await expect(page.getByText('Focus: Allowed a fork · 1 puzzle')).toBeVisible()
  await page.goto('/#/train?tactic=fork')
  await expect(page.getByText('Focus: Forks · 2 puzzles')).toBeVisible()

  // Neither of these has the side recorded as "missed", so the focus is empty, not wrong.
  await page.goto('/#/train?tactic=pin&p=missed')
  await expect(page.getByText('No puzzles for “Missed a pin” yet.')).toBeVisible()
  // A side that is not one is ignored.
  await page.goto('/#/train?tactic=fork&p=nonsense')
  await expect(page.getByText('Focus: Forks · 2 puzzles')).toBeVisible()
})

test('a side with no tactic is ignored, and puzzles with no side are offered when a side has none', async ({
  page,
}) => {
  const known = { ...PUZZLE, id: 'morphy|known', tactic: 'fork', perspective: 'missed' as const }
  const unknown = { ...PUZZLE, id: 'morphy|unknown', tactic: 'fork', perspective: null }
  await withPuzzle(page, [known, unknown])

  await page.goto('/#/train?p=missed')
  await expect(page.getByText('Focus:')).toHaveCount(0)

  await page.goto('/#/train?tactic=fork&p=allowed&u=Morphy')
  await expect(page.getByText('No puzzles for “Allowed a fork” yet.')).toBeVisible()
  await expect(page.getByText('1 puzzle of forks could not be sorted into allowed or missed')).toBeVisible()
  await page.getByRole('link', { name: 'Practise them all' }).click()
  await expect(page.getByText('Focus: Forks · 2 puzzles')).toBeVisible()
})
