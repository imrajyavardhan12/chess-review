import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildReview, parseGame, type EngineRecord, type ReviewSettings } from '../src'
import { readFixture, realBook } from './helpers'

/**
 * Golden parity: the TypeScript classifier must reproduce the Python reference review exactly when
 * given the same engine output. Python rounds some fields when it serialises, so numbers are
 * compared to within that rounding; labels, counts, notation and positions must be identical.
 */

interface PyMove {
  ply: number
  color: 'w' | 'b'
  number: number
  san: string
  uci: string
  best_san: string
  best_uci: string
  win_before: number
  win_after: number
  loss: number
  cp_loss: number
  accuracy: number
  label: string
  phase: string
  gap: number | null
}
interface Fixture {
  name: string
  pgn: string
  settings: { depth: number; nodes: number; hash_mb: number }
  infos: Array<{ cp: number; mate: number | null; best: string | null; second_cp: number | null }>
  expected: {
    white: string
    black: string
    result: string
    opening: string
    eco: string
    fens: string[]
    evals: Array<{ cp: number; mate: number | null }>
    win_series: number[]
    moves: PyMove[]
    accuracy: { white: number; black: number }
    counts: { white: Record<string, number>; black: Record<string, number> }
    phases: { white: Record<string, number | null>; black: Record<string, number | null> }
    acpl: { white: number; black: number }
    rating_estimate: { white: number; black: number }
  }
}

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url))
const names = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('book-') && !f.startsWith('math-'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort()

/** |a - b| within `digits` decimal places of rounding, plus float noise. */
const near = (a: number, b: number, digits: number) => Math.abs(a - b) <= 0.5 * 10 ** -digits + 1e-9

describe.each(names)('parity with the Python reference: %s', (name) => {
  const fx = readFixture<Fixture>(`${name}.json`)
  const settings: ReviewSettings = {
    depth: fx.settings.depth,
    nodes: fx.settings.nodes,
    hashMb: fx.settings.hash_mb,
    engine: 'fixture',
  }
  const game = parseGame(fx.pgn)
  const records: EngineRecord[] = fx.infos.map((i) => ({
    cp: i.cp,
    mate: i.mate,
    best: i.best,
    secondCp: i.second_cp,
  }))
  const review = buildReview(game, records, realBook(), settings)
  const py = fx.expected

  it('reads the same game: players, moves and positions', () => {
    expect([review.white, review.black, review.result]).toEqual([py.white, py.black, py.result])
    expect(review.fens).toEqual(py.fens)
    expect(review.moves.map((m) => m.san)).toEqual(py.moves.map((m) => m.san))
    expect(review.moves.map((m) => m.uci)).toEqual(py.moves.map((m) => m.uci))
  })

  it('assigns the same label, phase and best move to every move', () => {
    const got = review.moves.map((m) => [m.ply, m.number, m.color, m.label, m.phase, m.bestUci, m.bestSan])
    const want = py.moves.map((m) => [m.ply, m.number, m.color, m.label, m.phase, m.best_uci, m.best_san])
    expect(got).toEqual(want)
  })

  it('computes the same numbers, within the Python rounding', () => {
    review.moves.forEach((m, i) => {
      const p = py.moves[i]!
      const at = `move ${m.ply} (${m.san})`
      expect(near(m.winBefore, p.win_before, 2), `${at} winBefore ${m.winBefore} vs ${p.win_before}`).toBe(
        true,
      )
      expect(near(m.winAfter, p.win_after, 2), `${at} winAfter`).toBe(true)
      expect(near(m.loss, p.loss, 2), `${at} loss ${m.loss} vs ${p.loss}`).toBe(true)
      expect(near(m.accuracy, p.accuracy, 2), `${at} accuracy ${m.accuracy} vs ${p.accuracy}`).toBe(true)
      expect(near(m.cpLoss, p.cp_loss, 0), `${at} cpLoss ${m.cpLoss} vs ${p.cp_loss}`).toBe(true)
      expect(m.gap === null, `${at} gap presence`).toBe(p.gap === null)
      if (m.gap !== null) expect(near(m.gap, p.gap!, 1), `${at} gap ${m.gap} vs ${p.gap}`).toBe(true)
    })
    review.winSeries.forEach((w, i) => expect(near(w, py.win_series[i]!, 2), `winSeries[${i}]`).toBe(true))
    expect(review.evals).toEqual(py.evals)
  })

  it('totals match: accuracy, label counts, phases, centipawn loss, rating', () => {
    for (const side of ['white', 'black'] as const) {
      expect(
        near(review.accuracy[side], py.accuracy[side], 1),
        `${side} accuracy ${review.accuracy[side]} vs ${py.accuracy[side]}`,
      ).toBe(true)
      expect(review.counts[side]).toEqual(py.counts[side])
      expect(
        near(review.acpl[side], py.acpl[side], 0),
        `${side} acpl ${review.acpl[side]} vs ${py.acpl[side]}`,
      ).toBe(true)
      expect(review.ratingEstimate[side]).toBe(py.rating_estimate[side])
      for (const [phase, value] of Object.entries(py.phases[side])) {
        const got = review.phases[side][phase as 'opening']
        if (value === null) expect(got).toBeNull()
        else expect(near(got!, value, 1), `${side} ${phase} accuracy ${got} vs ${value}`).toBe(true)
      }
    }
  })

  it('names the opening the same way', () => {
    expect([review.opening, review.eco]).toEqual([py.opening, py.eco])
  })
})
