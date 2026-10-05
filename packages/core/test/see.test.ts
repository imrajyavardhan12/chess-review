import { describe, expect, it } from 'vitest'
import { see } from '../src'

describe('static exchange evaluation', () => {
  it('a piece walking onto a pawn-guarded square is lost', () => {
    expect(see('4k3/8/3p4/8/8/8/5B2/4K3 w - - 0 1', 'f2c5')).toBe(-3)
  })

  it('taking an undefended pawn wins a pawn', () => {
    expect(see('4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1', 'd1d5')).toBe(1)
  })

  it('an even pawn trade nets zero', () => {
    expect(see('4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1', 'e4d5')).toBe(0)
  })

  it('a quiet safe move is zero', () => {
    expect(see('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'g1f3')).toBe(0)
  })

  it('counts an en passant capture as winning a pawn', () => {
    // After 1.e4 Nf6 2.e5 d5 White takes en passant; the pawn on d6 is then recaptured by exd6.
    expect(see('rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', 'e5d6')).toBe(0)
  })

  it('a queen taking a defended pawn loses material', () => {
    expect(see('4k3/8/2p5/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5')).toBe(-8)
  })

  it('throws on a move from an empty square rather than guessing', () => {
    expect(() => see('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'a1a2')).toThrow()
  })
})
