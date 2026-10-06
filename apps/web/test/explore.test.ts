import { describe, expect, it } from 'vitest'
import { explore, fenOf, lineMoves, play, stepTo, targets } from '../src/explore'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('exploring from a position', () => {
  it('starts at the root and steps along a line, clamped to it', () => {
    const x = explore(START, ['e2e4', 'e7e5', 'g1f3'], 1)
    expect(fenOf(x)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    expect(stepTo(x, 99).at).toBe(3)
    expect(stepTo(x, -1).at).toBe(0)
    expect(fenOf(stepTo(x, 0))).toBe(START)
  })

  it('follows the line when the move played is the next one, and branches otherwise', () => {
    const x = explore(START, ['e2e4', 'e7e5', 'g1f3'], 1)
    expect(play(x, 'e7', 'e5')).toEqual({ root: START, moves: ['e2e4', 'e7e5', 'g1f3'], at: 2 })
    expect(play(x, 'c7', 'c5')).toEqual({ root: START, moves: ['e2e4', 'c7c5'], at: 2 })
  })

  it('refuses illegal moves', () => {
    expect(play(explore(START), 'e2', 'e5')).toBeNull()
    expect(play(explore(START), 'e7', 'e5')).toBeNull() // not Black's turn
  })

  it('promotes to a queen unless told otherwise', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1'
    expect(play(explore(fen), 'a7', 'a8')?.moves).toEqual(['a7a8q'])
    expect(play(explore(fen), 'a7', 'a8', 'n')?.moves).toEqual(['a7a8n'])
  })

  it('lists where a piece can go', () => {
    expect(targets(START, 'g1').sort()).toEqual(['f3', 'h3'])
    expect(targets(START, 'e4')).toEqual([])
  })

  it('numbers a line the way a score sheet does', () => {
    expect(lineMoves(START, ['e2e4', 'e7e5', 'g1f3']).map((m) => m.text)).toEqual(['1. e4', 'e5', '2. Nf3'])
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(lineMoves(afterE4, ['e7e5', 'g1f3']).map((m) => m.text)).toEqual(['1… e5', '2. Nf3'])
  })
})
