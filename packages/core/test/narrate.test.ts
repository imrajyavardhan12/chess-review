import { describe, expect, it } from 'vitest'
import { coachLine, moveName, type MoveReview, type Review } from '../src'

const move = (over: Partial<MoveReview>): MoveReview => ({
  ply: 1, color: 'w', number: 1, san: 'e4', uci: 'e2e4', bestSan: '', bestUci: '', winBefore: 50, winAfter: 50,
  loss: 0, cpLoss: 0, accuracy: 100, label: 'Best', phase: 'opening', gap: null, clockMs: null, ...over,
})
const review = (moves: MoveReview[], white = 90, black = 80): Review =>
  ({ white: 'Ann', black: 'Bob', moves, accuracy: { white, black } }) as unknown as Review

describe('moveName', () => {
  it('uses a dot for White and an ellipsis for Black', () => {
    expect(moveName({ number: 12, color: 'w', san: 'Nf3' })).toBe('12. Nf3')
    expect(moveName({ number: 12, color: 'b', san: 'Nf6' })).toBe('12… Nf6')
  })
})

describe('coachLine', () => {
  const blunder = move({ ply: 5, number: 3, san: 'Qxf7', label: 'Blunder', loss: 41.4 })

  it('speaks to the reader and points at their costliest error', () => {
    const c = coachLine(review([blunder]), 'white')
    expect(c.text).toBe(
      'You played more accurately than Bob, 90.0 to 80.0. Your costliest error was 3. Qxf7, which gave up 41% of your win chance.',
    )
    expect(c.move).toBe(blunder)
  })

  it('ignores the opponent’s errors when speaking to one side', () => {
    const c = coachLine(review([move({ ply: 2, color: 'b', label: 'Blunder', loss: 30 })]), 'white')
    expect(c.text).toContain('You made no mistakes or blunders.')
    expect(c.move).toBeNull()
  })

  it('credits brilliant moves before great ones, and points at them when there is no error', () => {
    const b = move({ ply: 7, label: 'Brilliant' })
    const g = move({ ply: 9, label: 'Great' })
    expect(coachLine(review([b, g]), 'white').text).toMatch(/You found 1 brilliant move\.$/)
    const only = coachLine(review([g, move({ ply: 11, label: 'Great' })]), 'white')
    expect(only.text).toMatch(/You found 2 great moves\.$/)
    expect(only.move).toBe(g)
  })

  it('says accuracy was close within three points, and names the better side otherwise', () => {
    expect(coachLine(review([], 85, 83), 'white').text).toMatch(/^Accuracy was close, 85.0 to 83.0/)
    expect(coachLine(review([], 70, 90), 'white').text).toMatch(/^Bob played more accurately, 90.0 to 70.0/)
  })

  it('describes both sides by name when the reader is unknown', () => {
    const c = coachLine(review([blunder]), null)
    expect(c.text).toBe('Ann played more accurately, 90.0 to 80.0. The biggest swing was 3. Qxf7 by Ann, worth 41% of win chance.')
    expect(coachLine(review([]), null).text).toMatch(/Neither side made a serious mistake\.$/)
  })

  it('treats Miss and Mistake as key errors too', () => {
    expect(coachLine(review([move({ label: 'Miss', loss: 12 })]), 'white').move?.label).toBe('Miss')
    expect(coachLine(review([move({ label: 'Inaccuracy', loss: 7 })]), 'white').move).toBeNull()
  })
})
