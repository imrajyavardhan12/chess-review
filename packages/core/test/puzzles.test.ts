import { describe, expect, it } from 'vitest'
import { dedupeByPosition, puzzleCandidates, type MoveReview, type Review } from '../src'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

function move(over: Partial<MoveReview>): MoveReview {
  return {
    ply: 1,
    color: 'w',
    number: 1,
    san: 'a3',
    uci: 'a2a3',
    bestSan: 'e4',
    bestUci: 'e2e4',
    winBefore: 55,
    winAfter: 25,
    loss: 30,
    cpLoss: 300,
    accuracy: 10,
    label: 'Blunder',
    phase: 'opening',
    gap: null,
    clockMs: null,
    ...over,
  }
}

function review(moves: MoveReview[], fens: string[]): Review {
  return { moves, fens, lines: fens.map(() => ['e2e4', 'e7e5']) } as unknown as Review
}

describe('puzzleCandidates', () => {
  it("keeps the player's own costly mistakes, worst first", () => {
    const r = review(
      [move({ loss: 25 }), move({ ply: 3, loss: 45, label: 'Blunder' }), move({ ply: 5, loss: 22 })],
      [START, START, START],
    )
    expect(puzzleCandidates(r, 'white').map((c) => c.loss)).toEqual([45, 25, 22])
  })

  it("ignores the opponent's moves", () => {
    const r = review([move({ color: 'b' })], [BLACK_TO_MOVE])
    expect(puzzleCandidates(r, 'white')).toEqual([])
    expect(puzzleCandidates(r, 'black')).toHaveLength(1)
  })

  it('skips small losses and moves that are not mistakes', () => {
    const r = review(
      [
        move({ loss: 12, label: 'Mistake' }),
        move({ label: 'Good', loss: 25 }),
        move({ label: 'Inaccuracy' }),
      ],
      [START, START, START],
    )
    expect(puzzleCandidates(r, 'white')).toEqual([])
  })

  it('skips positions that were already lost or already easily won', () => {
    const r = review([move({ winBefore: 10 }), move({ winBefore: 96 })], [START, START])
    expect(puzzleCandidates(r, 'white')).toEqual([])
  })

  it('skips a move that was the engine best move', () => {
    const r = review([move({ uci: 'e2e4' })], [START])
    expect(puzzleCandidates(r, 'white')).toEqual([])
  })

  it('carries the line only when it starts with the best move', () => {
    const r = review([move({ bestUci: 'd2d4' })], [START])
    expect(puzzleCandidates(r, 'white')[0]!.line).toEqual(['d2d4'])
  })
})

describe('dedupeByPosition', () => {
  it('keeps the first of positions that differ only in move counters', () => {
    const a = { fen: START, id: 1 }
    const b = { fen: START.replace(/ 0 1$/, ' 4 9'), id: 2 }
    expect(dedupeByPosition([a, b])).toEqual([a])
  })
})
