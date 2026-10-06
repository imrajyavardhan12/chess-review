import { describe, expect, it } from 'vitest'
import {
  buildReview,
  emptyBook,
  formatClock,
  formatSpent,
  moveTimes,
  parseGame,
  parseTimeControl,
  timeReport,
  troubleThresholdMs,
  type EngineRecord,
  type Label,
} from '../src'
import { readFixture } from './helpers'

const records = (n: number): EngineRecord[] =>
  Array.from({ length: n }, () => ({ cp: 0, mate: null, best: null, secondCp: null, pv: [] }))

function review(pgn: string, labels: Label[] = []) {
  const game = parseGame(pgn)
  const r = buildReview(game, records(game.fens.length), emptyBook, {
    depth: 1,
    nodes: 1,
    hashMb: 1,
    engine: 't',
  })
  return { ...r, moves: r.moves.map((m, i) => ({ ...m, label: labels[i] ?? m.label })) }
}

const TIMED = `[TimeControl "60+1"]

1. e4 {[%clk 0:01:00]} e5 {[%clk 0:00:58]} 2. Nf3 {[%clk 0:00:51]} Nc6 {[%clk 0:00:20]} 3. Bb5 {[%clk 0:00:41]} a6 {[%clk 0:00:04]} 4. Ba4 {[%clk 0:00:40]} b5 {[%clk 0:00:04]} *`

describe('time controls', () => {
  it('reads base and increment, and nothing for daily or missing controls', () => {
    expect(parseTimeControl('180')).toEqual({ baseMs: 180_000, incrementMs: 0 })
    expect(parseTimeControl('600+5')).toEqual({ baseMs: 600_000, incrementMs: 5000 })
    expect(parseTimeControl('1/86400')).toBeNull()
    expect(parseTimeControl('-')).toBeNull()
    expect(parseTimeControl(undefined)).toBeNull()
  })

  it('puts time trouble at a tenth of the base time, at most two minutes', () => {
    expect(troubleThresholdMs({ baseMs: 60_000, incrementMs: 0 })).toBe(6000)
    expect(troubleThresholdMs({ baseMs: 600_000, incrementMs: 0 })).toBe(60_000)
    expect(troubleThresholdMs({ baseMs: 5_400_000, incrementMs: 0 })).toBe(120_000)
  })
})

describe('think time per move', () => {
  it('takes the clock difference plus the increment, starting from the base time', () => {
    const t = moveTimes(review(TIMED))!
    expect(t.map((m) => m.spentMs)).toEqual([1000, 3000, 10_000, 39_000, 11_000, 17_000, 2000, 1000])
  })

  it('marks moves made with less than the threshold on the clock', () => {
    const t = moveTimes(review(TIMED))!
    // Black had 20 s before ...a6 and 4 s before ...b5: only the second is under 6 s.
    expect(t.filter((m) => m.inTrouble).map((m) => m.ply)).toEqual([8])
  })

  it('is null for a game without clocks', () => {
    expect(moveTimes(review('1. e4 e5 2. Nf3 *'))).toBeNull()
    expect(timeReport(review('1. e4 e5 2. Nf3 *'))).toBeNull()
  })

  it('reads real chess.com clocks', () => {
    const fx = readFixture<{ pgn: string }>('chesscom-blitz-mate.json')
    const t = moveTimes(review(fx.pgn))!
    expect(t.length).toBeGreaterThan(30)
    expect(t.every((m) => m.spentMs !== null && m.spentMs >= 0)).toBe(true)
    expect(Math.max(...t.map((m) => m.clockMs))).toBeLessThanOrEqual(180_000)
  })
})

describe('time report', () => {
  it('counts errors made in time trouble apart from the rest', () => {
    const labels: Label[] = ['Best', 'Best', 'Best', 'Mistake', 'Best', 'Best', 'Best', 'Blunder']
    const r = timeReport(review(TIMED, labels))!
    expect(r.thresholdMs).toBe(6000)
    expect(r.sides.black).toMatchObject({
      moves: 4,
      longest: { ply: 4, ms: 39_000 },
      troubleMoves: 1,
      troubleErrors: 1,
      calmMoves: 3,
      calmErrors: 1,
    })
    expect(r.sides.black.averageMs).toBeCloseTo((3000 + 39_000 + 17_000 + 1000) / 4)
    expect(r.sides.white).toMatchObject({ troubleMoves: 0, calmErrors: 0 })
  })
})

describe('formatting', () => {
  it('writes clocks and think times the way players read them', () => {
    expect(formatClock(65_900)).toBe('1:05')
    expect(formatClock(9000)).toBe('0:09')
    expect(formatClock(3_723_000)).toBe('1:02:03')
    expect(formatSpent(1400)).toBe('1.4 s')
    expect(formatSpent(12_300)).toBe('12 s')
    expect(formatSpent(125_000)).toBe('2 min 5 s')
    expect(formatSpent(120_000)).toBe('2 min')
  })
})
