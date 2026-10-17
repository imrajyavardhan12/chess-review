import { describe, expect, it } from 'vitest'
import { moveFromText } from '../src/puzzle-input'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// White to move: Nxd5 is possible, and so is the pawn capture exd5.
const CAPTURES = 'rnbqkb1r/ppp1pppp/5n2/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3'
const CASTLE = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'

describe('moveFromText', () => {
  it('reads score-sheet notation, with or without check marks', () => {
    expect(moveFromText(START, 'e4')).toBe('e2e4')
    expect(moveFromText(START, 'Nf3')).toBe('g1f3')
    expect(moveFromText(CAPTURES, 'Nxd5')).toBe('c3d5')
    expect(moveFromText(CAPTURES, ' exd5+ ')).toBe('e4d5')
  })

  it('reads coordinates', () => {
    expect(moveFromText(START, 'E2E4')).toBe('e2e4')
  })

  it('reads castling written with letters or zeros', () => {
    expect(moveFromText(CASTLE, 'O-O')).toBe('e1g1')
    expect(moveFromText(CASTLE, '0-0-0')).toBe('e1c1')
  })

  it('gives null for illegal moves, empty text and text that is not a move', () => {
    expect(moveFromText(START, 'e5')).toBeNull()
    expect(moveFromText(START, 'Nf6')).toBeNull()
    expect(moveFromText(START, '')).toBeNull()
    expect(moveFromText(START, 'hello')).toBeNull()
  })

  it('does not read a lower-case piece letter as a piece', () => {
    expect(moveFromText(START, 'nf3')).toBeNull()
  })
})
