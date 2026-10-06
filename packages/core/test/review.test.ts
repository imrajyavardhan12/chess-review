import { describe, expect, it } from 'vitest'
import {
  buildReview,
  classifyByLoss,
  createBook,
  emptyBook,
  openingFromHeaders,
  parseGame,
  type EngineRecord,
  type ReviewSettings,
} from '../src'

const settings: ReviewSettings = { depth: 1, nodes: 1, hashMb: 1, engine: 'test' }
const rec = (cp: number, best: string | null, secondCp: number | null = null): EngineRecord => ({
  cp,
  mate: null,
  best,
  secondCp,
  pv: best ? [best] : [],
})

describe('classifyByLoss', () => {
  it.each([
    [0, true, 'Best'],
    [1.5, false, 'Excellent'],
    [2, false, 'Excellent'],
    [4, false, 'Good'],
    [9, false, 'Inaccuracy'],
    [15, false, 'Mistake'],
    [25, false, 'Blunder'],
  ] as const)('loss %s best=%s -> %s', (loss, isBest, label) => {
    expect(classifyByLoss(loss, isBest)).toBe(label)
  })
})

describe('buildReview rules', () => {
  const game = parseGame('1. e4 e5 2. Nf3 *')

  it('labels a move that matches the engine as Best with 100% accuracy', () => {
    const r = buildReview(
      game,
      [rec(0, 'e2e4'), rec(0, 'e7e5'), rec(0, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(r.moves.map((m) => [m.label, m.accuracy])).toEqual([
      ['Best', 100],
      ['Best', 100],
      ['Best', 100],
    ])
  })

  it('measures loss from the mover’s side, including for Black', () => {
    // White plays a non-best move that drops its eval, then Black does the same.
    const r = buildReview(
      game,
      [rec(0, 'd2d4'), rec(-300, 'c7c5'), rec(0, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(r.moves[0]!.label).toBe('Blunder')
    expect(r.moves[0]!.loss).toBeGreaterThan(20)
    // Black went from -300 (Black ahead) back to 0: Black gave up win chance too.
    expect(r.moves[1]!.winBefore).toBeGreaterThan(70)
    expect(r.moves[1]!.loss).toBeGreaterThan(20)
  })

  it('calls a mistake right after the opponent’s mistake a Miss', () => {
    const r = buildReview(
      game,
      [rec(0, 'd2d4'), rec(-300, 'c7c5'), rec(-140, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(r.moves[0]!.label).toBe('Blunder') // White erred first
    expect(r.moves[1]!.label).toBe('Miss') // Black was winning and let it slip
  })

  it('does not call it a Miss if the opponent had not erred', () => {
    const r = buildReview(
      game,
      [rec(0, 'e2e4'), rec(0, 'c7c5'), rec(-300, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(r.moves[1]!.label).not.toBe('Miss')
  })

  it('does not call taking back a piece Great, however forced', () => {
    // 4... Qxd5 takes back on d5; 4... Qd6 is a quiet move. The engine says both are the only move.
    const lastLabel = (pgn: string) => {
      const g = parseGame(pgn)
      const records = g.moves.map((m) => rec(0, m.uci))
      records.push(rec(0, null))
      records[records.length - 2] = rec(0, g.moves.at(-1)!.uci, 300) // Black to move: +300 is bad for Black
      return buildReview(g, records, emptyBook, settings).moves.at(-1)!.label
    }
    expect(lastLabel('1. e4 d5 2. exd5 Nf6 3. Nc3 Nxd5 4. Nxd5 Qxd5 *')).toBe('Best')
    expect(lastLabel('1. e4 d5 2. exd5 Nf6 3. Nc3 Nxd5 4. Nxd5 Qd6 *')).toBe('Great')
  })

  it('gives Great only for an only-move in a contested position', () => {
    const contested = buildReview(
      game,
      [rec(0, 'e2e4', -300), rec(0, 'e7e5'), rec(0, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(contested.moves[0]!.label).toBe('Great')
    expect(contested.moves[0]!.gap).toBeGreaterThan(20)

    const decided = buildReview(
      game,
      [rec(600, 'e2e4', 100), rec(0, 'e7e5'), rec(0, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(decided.moves[0]!.label).toBe('Best') // already winning: not great

    const narrow = buildReview(
      game,
      [rec(0, 'e2e4', -20), rec(0, 'e7e5'), rec(0, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(narrow.moves[0]!.label).toBe('Best') // runner-up is nearly as good
  })

  it('gives Brilliant for a near-best sacrifice that is not already decided, and not for a safe move', () => {
    const sac = parseGame('[SetUp "1"]\n[FEN "4k3/8/3p4/8/8/8/5B2/4K3 w - - 0 1"]\n\n1. Bc5 *')
    expect(buildReview(sac, [rec(0, 'f2c5'), rec(0, null)], emptyBook, settings).moves[0]!.label).toBe(
      'Brilliant',
    )
    // Same move, but the position was already overwhelmingly winning: not brilliant.
    expect(buildReview(sac, [rec(900, 'f2c5'), rec(900, null)], emptyBook, settings).moves[0]!.label).toBe(
      'Best',
    )
    // A safe developing move is never a sacrifice.
    const quiet = parseGame('1. Nf3 *')
    expect(buildReview(quiet, [rec(0, 'g1f3'), rec(0, null)], emptyBook, settings).moves[0]!.label).toBe(
      'Best',
    )
  })

  it('marks Book moves, gives them full accuracy, and finds the opening name', () => {
    const afterE4 = game.moves[0]!.fenAfter.split(' ').slice(0, 4).join(' ')
    const book = createBook({
      version: 1,
      positions: [afterE4],
      named: { [afterE4]: ['B00', "King's Pawn"] },
    })
    const r = buildReview(
      game,
      [rec(0, 'd2d4'), rec(0, 'e7e5'), rec(0, 'g1f3'), rec(0, null)],
      book,
      settings,
    )
    expect(r.moves[0]!.label).toBe('Book')
    expect(r.moves[0]!.accuracy).toBe(100)
    expect(r.opening).toBe("King's Pawn")
    expect(r.eco).toBe('B00')
  })

  it('does not call a real mistake Book', () => {
    const afterE4 = game.moves[0]!.fenAfter.split(' ').slice(0, 4).join(' ')
    const book = createBook({ version: 1, positions: [afterE4], named: {} })
    const r = buildReview(
      game,
      [rec(0, 'd2d4'), rec(-400, 'e7e5'), rec(0, 'g1f3'), rec(0, null)],
      book,
      settings,
    )
    expect(r.moves[0]!.label).not.toBe('Book')
  })

  it('uses only phases that never go backwards', () => {
    const r = buildReview(
      game,
      [rec(0, 'e2e4'), rec(0, 'e7e5'), rec(0, 'g1f3'), rec(0, null)],
      emptyBook,
      settings,
    )
    expect(r.moves.every((m) => m.phase === 'opening')).toBe(true)
    expect(r.phases.white.middlegame).toBeNull()
  })

  it('refuses mismatched record counts instead of producing nonsense', () => {
    expect(() => buildReview(game, [rec(0, 'e2e4')], emptyBook, settings)).toThrow(/expected 4/)
  })

  it('carries clock data through', () => {
    const g = parseGame('1. e4 {[%clk 0:03:00]} e5 {[%clk 0:02:50]} *')
    const r = buildReview(g, [rec(0, 'e2e4'), rec(0, 'e7e5'), rec(0, null)], emptyBook, settings)
    expect(r.moves.map((m) => m.clockMs)).toEqual([180_000, 170_000])
  })

  it('keeps the engine line of every position, parallel to the positions', () => {
    const g = parseGame('1. e4 e5 *')
    const r = buildReview(
      g,
      [{ ...rec(30, 'e2e4'), pv: ['e2e4', 'e7e5', 'g1f3'] }, rec(30, 'c7c5'), rec(30, null)],
      emptyBook,
      settings,
    )
    expect(r.lines).toEqual([['e2e4', 'e7e5', 'g1f3'], ['c7c5'], []])
  })
})

describe('openingFromHeaders', () => {
  it('prefers an Opening header', () => {
    expect(openingFromHeaders({ Opening: 'Sicilian Defense' })).toBe('Sicilian Defense')
  })
  it('reads a chess.com slug and drops the move list that runs on after it', () => {
    expect(openingFromHeaders({ ECOUrl: 'https://www.chess.com/openings/Modern-Defense-with-1.e4-g6' })).toBe(
      'Modern Defense',
    )
    expect(openingFromHeaders({ ECOUrl: 'https://www.chess.com/openings/Italian-Game-Giuoco-Piano' })).toBe(
      'Italian Game Giuoco Piano',
    )
  })
  it('is empty when there is nothing to read', () => {
    expect(openingFromHeaders({})).toBe('')
  })
})
