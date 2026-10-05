import { describe, expect, it } from 'vitest'
import { estimateRating, gameAccuracy, mean, moveAccuracy, pstdev, winPercent } from '../src'
import { readFixture } from './helpers'

interface MathRefs {
  winPercent: Record<string, number>
  moveAccuracy: Array<[number, number, number]>
  estimateRating: Record<string, number>
}
const ref = readFixture<MathRefs>('math-python.json')

describe('win chance and accuracy (matches the Python reference)', () => {
  it.each(Object.entries(ref.winPercent))('winPercent(%s)', (cp, expected) => {
    expect(winPercent(Number(cp))).toBeCloseTo(expected, 9)
  })

  it.each(ref.moveAccuracy)('moveAccuracy(%s -> %s)', (before, after, expected) => {
    expect(moveAccuracy(before, after)).toBeCloseTo(expected, 9)
  })

  it.each(Object.entries(ref.estimateRating))('estimateRating(%s)', (acpl, expected) => {
    expect(estimateRating(Number(acpl))).toBe(expected)
  })
})

describe('invariants', () => {
  it('win chance is symmetric, monotonic and bounded', () => {
    expect(winPercent(0)).toBe(50)
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100, 9)
    expect(winPercent(100)).toBeLessThan(winPercent(200))
    expect(winPercent(10_000)).toBeLessThanOrEqual(100)
  })

  it('a move that loses nothing is 100% accurate, and accuracy falls with loss', () => {
    expect(moveAccuracy(60, 60)).toBeGreaterThan(99.9)
    expect(moveAccuracy(60, 59)).toBeGreaterThan(moveAccuracy(60, 50))
    expect(moveAccuracy(60, 50)).toBeGreaterThan(moveAccuracy(60, 30))
    expect(moveAccuracy(60, 90)).toBeGreaterThan(99.9) // gaining win chance is not penalised
  })

  it('rating estimate is clamped and rounded to tens', () => {
    expect(estimateRating(0)).toBeLessThanOrEqual(3000)
    expect(estimateRating(100_000)).toBe(100)
    expect(estimateRating(25) % 10).toBe(0)
  })

  it('mean and population stdev', () => {
    expect(mean([])).toBe(0)
    expect(mean([1, 2, 3])).toBe(2)
    expect(pstdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
    expect(pstdev([5])).toBe(0)
  })

  it('game accuracy of a flawless side is 100 and ignores an empty side', () => {
    const wins = [50, 52, 51, 53, 52, 54]
    const perfect = [1, 3, 5].map((ply) => ({ ply, accuracy: 100 }))
    expect(gameAccuracy(wins, perfect, 5)).toBeCloseTo(100, 6)
    expect(gameAccuracy(wins, [], 5)).toBe(0)
  })
})
