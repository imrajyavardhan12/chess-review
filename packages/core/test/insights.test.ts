import { describe, expect, it } from 'vitest'
import {
  buildReview,
  chronological,
  emptyBook,
  gameFacts,
  insights,
  isoDate,
  parseGame,
  playersIn,
  timeClass,
  type EngineRecord,
  type Label,
  type Review,
} from '../src'

const PGN = (white: string, black: string, result: string, date: string, tc: string) =>
  `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[Date "${date}"]\n[TimeControl "${tc}"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ${result}`

/** A small real review, then the labels and accuracies a test needs. */
function review(
  white: string,
  black: string,
  result: string,
  date: string,
  tc: string,
  opts: { accuracy?: [number, number]; labels?: Label[]; opening?: string } = {},
): Review {
  const game = parseGame(PGN(white, black, result, date, tc))
  const records: EngineRecord[] = game.fens.map(() => ({
    cp: 0,
    mate: null,
    best: null,
    secondCp: null,
    pv: [],
  }))
  const r = buildReview(game, records, emptyBook, { depth: 1, nodes: 1, hashMb: 1, engine: 'test' })
  return {
    ...r,
    opening: opts.opening ?? 'Ruy Lopez: Morphy Defense',
    eco: 'C70',
    accuracy: { white: opts.accuracy?.[0] ?? 80, black: opts.accuracy?.[1] ?? 70 },
    moves: r.moves.map((m, i) => ({ ...m, label: opts.labels?.[i] ?? 'Best' })),
  }
}

describe('reading game metadata', () => {
  it('classifies time controls by base time plus 40 increments', () => {
    expect(timeClass('60')).toBe('bullet')
    expect(timeClass('120+1')).toBe('bullet') // 160 s, as Lichess has it
    expect(timeClass('180+2')).toBe('blitz') // 260 s
    expect(timeClass('600')).toBe('rapid')
    expect(timeClass('900+10')).toBe('rapid') // 900 + 400 = 1300 s
    expect(timeClass('900+15')).toBe('classical') // 1500 s
    expect(timeClass('1800')).toBe('classical')
    expect(timeClass('1/86400')).toBe('daily')
    expect(timeClass('-')).toBe('unknown')
    expect(timeClass(undefined)).toBe('unknown')
  })

  it('reads full dates only', () => {
    expect(isoDate({ Date: '2024.03.07' })).toBe('2024-03-07')
    expect(isoDate({ UTCDate: '2024.03.08', Date: '2024.03.07' })).toBe('2024-03-08')
    expect(isoDate({ Date: '2024.??.??' })).toBeNull()
  })
})

describe('one game from the player’s side', () => {
  it('finds the player on either side, case-insensitively, and nothing for a stranger', () => {
    const r = review('Ann', 'Bob', '0-1', '2024.01.02', '600')
    expect(gameFacts('a', r, 'bob', 0)).toMatchObject({
      side: 'black',
      result: 'win',
      accuracy: 70,
      opponent: 'Ann',
    })
    expect(gameFacts('a', r, 'ANN', 0)).toMatchObject({ side: 'white', result: 'loss', accuracy: 80 })
    expect(gameFacts('a', r, 'Cy', 0)).toBeNull()
  })

  it('counts only the player’s own moves and tags only their errors', () => {
    const r = review('Ann', 'Bob', '1/2-1/2', '2024.01.02', '600', {
      labels: ['Blunder', 'Mistake', 'Inaccuracy', 'Best', 'Miss', 'Blunder'],
    })
    const tagged: number[] = []
    const f = gameFacts(
      'a',
      r,
      'Ann',
      0,
      (i) => (tagged.push(i), i === 0 ? { kind: 'fork', perspective: 'allowed' } : null),
    )!
    expect(f.result).toBe('draw')
    expect(f.phases.opening).toEqual({ moves: 3, counts: { Blunder: 1, Inaccuracy: 1, Miss: 1 } })
    expect(tagged).toEqual([0, 4]) // White's blunder and miss, not Black's mistake
    expect(f.tactics).toEqual([{ kind: 'fork', perspective: 'allowed' }])
  })
})

describe('insights across games', () => {
  const games = [
    review('Ann', 'Bob', '1-0', '2024.01.03', '180', { accuracy: [90, 60], labels: ['Mistake'] }),
    review('Bob', 'Ann', '1-0', '2024.01.01', '600', {
      accuracy: [75, 50],
      opening: 'Sicilian Defense: Najdorf',
    }),
    review('Ann', 'Cy', '1/2-1/2', '2024.01.02', '180', { accuracy: [70, 70] }),
  ].map((r, i) => gameFacts(`g${i}`, r, 'Ann', i, () => ({ kind: 'fork', perspective: 'allowed' }))!)
  const x = insights(games)

  it('orders the accuracy trend oldest first', () => {
    expect(x.games).toBe(3)
    expect(x.trend.map((t) => [t.date, t.accuracy])).toEqual([
      ['2024-01-01', 50],
      ['2024-01-02', 70],
      ['2024-01-03', 90],
    ])
    expect(x.accuracy).toBeCloseTo(70)
  })

  it('rates errors per 100 moves in each phase', () => {
    expect(x.phases.opening.moves).toBe(9)
    expect(x.phases.opening.per100.Mistake).toBeCloseTo(100 / 9)
    expect(x.phases.endgame).toEqual({ moves: 0, per100: { Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0 } })
  })

  it('counts tactical errors and how many errors had one', () => {
    expect(x.tactics).toEqual([{ kind: 'fork', perspective: 'allowed', count: 1 }])
    expect(x.tagged).toEqual({ errors: 1, withTactic: 1 })
  })

  it('scores openings and time controls from the player’s side', () => {
    expect(x.openings).toEqual([
      { opening: 'Ruy Lopez', eco: 'C70', games: 2, wins: 1, draws: 1, losses: 0, score: 75, accuracy: 80 },
      {
        opening: 'Sicilian Defense',
        eco: 'C70',
        games: 1,
        wins: 0,
        draws: 0,
        losses: 1,
        score: 0,
        accuracy: 50,
      },
    ])
    expect(x.timeClasses.map((t) => [t.timeClass, t.games, t.score])).toEqual([
      ['blitz', 2, 75],
      ['rapid', 1, 0],
    ])
  })

  it('is empty, not broken, with no games', () => {
    const none = insights([])
    expect(none).toMatchObject({
      games: 0,
      trend: [],
      accuracy: 0,
      tactics: [],
      openings: [],
      timeClasses: [],
    })
  })

  it('orders undated games by when they were reviewed', () => {
    const undated = games.map((g, i) => ({ ...g, date: null, reviewedAt: 10 - i }))
    expect(chronological(undated).map((g) => g.id)).toEqual(['g2', 'g1', 'g0'])
  })
})

describe('players in the stored reviews', () => {
  it('lists names by how many games they appear in', () => {
    const rs = [
      review('Ann', 'Bob', '1-0', '', '-'),
      review('ann', 'Cy', '1-0', '', '-'),
      review('Bob', 'Ann', '1-0', '', '-'),
    ]
    expect(playersIn(rs)).toEqual([
      { name: 'Ann', games: 3 },
      { name: 'Bob', games: 2 },
      { name: 'Cy', games: 1 },
    ])
  })
})
