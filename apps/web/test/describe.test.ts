import { describe, expect, it } from 'vitest'
import { describePosition } from '../src/describe'

describe('describePosition', () => {
  it('names every piece by side and kind, with its squares', () => {
    expect(describePosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(
      'White: king e1, queen d1, rooks a1 h1, bishops c1 f1, knights b1 g1, pawns a2 b2 c2 d2 e4 f2 g2 h2. ' +
        'Black: king e8, queen d8, rooks a8 h8, bishops c8 f8, knights b8 g8, pawns a7 b7 c7 d7 e7 f7 g7 h7. ' +
        'Black to move.',
    )
    expect(describePosition('6k1/8/8/8/8/8/8/R5K1 w - - 0 1')).toBe(
      'White: king g1, rook a1. Black: king g8. White to move.',
    )
  })
})
