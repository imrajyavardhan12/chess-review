import { describe, expect, it } from 'vitest'
import { InvalidPgnError, parseGame } from '../src'

describe('parseGame', () => {
  it('reads moves, positions, ply and move numbers', () => {
    const g = parseGame('1. e4 e5 2. Nf3 *')
    expect(g.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(g.moves.map((m) => m.uci)).toEqual(['e2e4', 'e7e5', 'g1f3'])
    expect(g.moves.map((m) => [m.ply, m.number, m.color])).toEqual([
      [1, 1, 'w'],
      [2, 1, 'b'],
      [3, 2, 'w'],
    ])
    expect(g.fens).toHaveLength(4)
    expect(g.fens[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(g.fens[3]).toBe(g.moves[2]!.fenAfter)
  })

  it('reads headers and clock comments in chess.com format', () => {
    const g = parseGame(
      '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:02:59.9]} 2. Nf3 {[%clk 1:00:05]} 1-0',
    )
    expect(g.headers.White).toBe('A')
    expect(g.headers.Result).toBe('1-0')
    expect(g.moves.map((m) => m.clockMs)).toEqual([180_000, 179_900, 3_605_000])
  })

  it('leaves clockMs null when the PGN has no clock data', () => {
    expect(parseGame('1. e4 e5 *').moves.every((m) => m.clockMs === null)).toBe(true)
  })

  it('starts from a FEN header', () => {
    const fen = '4k3/8/3p4/8/8/8/5B2/4K3 w - - 0 1'
    const g = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. Bc5 *`)
    expect(g.startFen).toBe(fen)
    expect(g.moves[0]!.uci).toBe('f2c5')
  })

  it('records promotions in the uci and flags them', () => {
    const g = parseGame('[SetUp "1"]\n[FEN "1r5k/P7/8/8/8/8/8/K7 w - - 0 1"]\n\n1. axb8=N Kg7 *')
    expect(g.moves[0]!.uci).toBe('a7b8n')
    expect(g.moves[0]!.promotion).toBe(true)
    expect(g.moves[1]!.promotion).toBe(false)
  })

  it('rejects an illegal move instead of truncating the game', () => {
    expect(() => parseGame('1. e4 e5 2. Nf3 Nc6 3. Rxd8 *')).toThrow(InvalidPgnError)
  })

  it('rejects text with no moves', () => {
    expect(() => parseGame('[White "A"]\n\n*')).toThrow(InvalidPgnError)
    expect(() => parseGame('hello')).toThrow(InvalidPgnError)
  })
})
