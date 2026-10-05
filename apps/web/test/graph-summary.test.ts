import { describe, expect, it } from 'vitest'
import type { Review } from '@chessreview/core'
import { graphSummary } from '../src/EvalGraph'

const move = (ply: number, san: string) => ({
  ply,
  number: Math.ceil(ply / 2),
  color: ply % 2 ? 'w' : 'b',
  san,
})

describe('graphSummary', () => {
  it('names the start, the end and the three biggest swings, in game order', () => {
    const review = {
      winSeries: [50, 52, 30, 31, 80, 70, 99],
      moves: [move(1, 'e4'), move(2, 'Qh4'), move(3, 'Nc3'), move(4, 'Qxf2'), move(5, 'Kxf2'), move(6, 'g6')],
    } as unknown as Review
    expect(graphSummary(review)).toBe(
      "White's win chance over the game, from 50% to 99%. Biggest swings: 1… Qh4 (down 22%), 2… Qxf2 (up 49%), 3… g6 (up 29%). The move list has every move.",
    )
  })

  it('says when nothing swung', () => {
    const review = { winSeries: [50, 51], moves: [move(1, 'e4')] } as unknown as Review
    expect(graphSummary(review)).toContain('No move swung it by 10% or more.')
  })
})
