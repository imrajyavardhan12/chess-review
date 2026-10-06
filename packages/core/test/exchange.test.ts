import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_VERSION,
  ReviewFileError,
  buildReview,
  exportJson,
  exportPgn,
  importJson,
  parseGame,
  reviewKey,
  type EngineRecord,
  type ReviewSettings,
} from '../src'
import { readFixture, realBook } from './helpers'

interface Fixture {
  pgn: string
  settings: { depth: number; nodes: number; hash_mb: number }
  infos: Array<{ cp: number; mate: number | null; best: string | null; second_cp: number | null }>
}

/** A real review: the Opera game from the golden fixtures. */
function opera() {
  const fx = readFixture<Fixture>('opera-game-1858.json')
  const settings: ReviewSettings = { depth: 16, nodes: 200_000, hashMb: 16, engine: 'fixture' }
  const records: EngineRecord[] = fx.infos.map((i) => ({
    cp: i.cp,
    mate: i.mate,
    best: i.best,
    secondCp: i.second_cp,
    pv: [],
  }))
  return { pgn: fx.pgn, review: buildReview(parseGame(fx.pgn), records, realBook(), settings) }
}

describe('annotated PGN', () => {
  const { review } = opera()
  const pgn = exportPgn(review)

  it('is a PGN of the same game that any reader can parse', () => {
    const back = parseGame(pgn)
    expect(back.moves.map((m) => m.san)).toEqual(review.moves.map((m) => m.san))
    expect(back.headers).toMatchObject({ White: 'Morphy, Paul', Result: '1-0', Annotator: 'chessreview' })
  })

  it('marks labels with their NAGs and comments errors with their cost and the better move', () => {
    const mistake = review.moves.find((m) => m.label === 'Mistake' || m.label === 'Blunder')!
    const flat = pgn.replace(/\s+/g, ' ')
    expect(flat).toMatch(
      new RegExp(
        `${mistake.san.replace('+', '\\+')} \\$[24] \\{ \\[%eval [^\\]]+\\] ${mistake.label}: gave up`,
      ),
    )
    expect(flat).toContain(`Best was ${mistake.bestSan}.`)
    expect(flat).toContain('17. Rd8# 1-0') // no score once the game is over
    expect(flat).toContain('[%eval #1]') // a forced mate is written as mate, not as +100
  })

  it('keeps every line within 80 characters', () => {
    expect(Math.max(...pgn.split('\n').map((l) => l.length))).toBeLessThanOrEqual(80)
  })

  it('carries clocks through', () => {
    const g = parseGame('1. e4 {[%clk 0:03:00]} e5 {[%clk 0:02:58]} *')
    const r = buildReview(
      g,
      g.fens.map(() => ({ cp: 0, mate: null, best: null, secondCp: null, pv: [] })),
      realBook(),
      { depth: 1, nodes: 1, hashMb: 1, engine: 'x' },
    )
    expect(exportPgn(r)).toContain('[%clk 0:02:58]')
    expect(parseGame(exportPgn(r)).moves.map((m) => m.clockMs)).toEqual([180_000, 178_000])
  })
})

describe('JSON export and import', () => {
  it('round-trips a review exactly', async () => {
    const { pgn, review } = opera()
    const id = await reviewKey(pgn, review.settings)
    const back = await importJson(exportJson(id, pgn, review))
    expect(back).toEqual({ id, pgn, review })
  })

  it('refuses files that are not reviews, or not this version, with a reason', async () => {
    const { pgn, review } = opera()
    const id = await reviewKey(pgn, review.settings)
    const variant = (patch: (f: Record<string, unknown>) => void) => {
      const f = JSON.parse(exportJson(id, pgn, review)) as Record<string, unknown>
      patch(f)
      return JSON.stringify(f)
    }
    await expect(importJson('not json')).rejects.toThrow(/not JSON/)
    await expect(importJson('{"format":"other"}')).rejects.toThrow(/not a chessreview review/)
    await expect(
      importJson(
        variant((f) => ((f.review as Record<string, unknown>).schemaVersion = ANALYSIS_VERSION - 1)),
      ),
    ).rejects.toThrow(/older analysis rules/)
    await expect(importJson(variant((f) => (f.version = 2)))).rejects.toThrow(/newer version/)
  })

  it('refuses a review that does not describe its own PGN, or carries the wrong id', async () => {
    const { pgn, review } = opera()
    const id = await reviewKey(pgn, review.settings)
    const tamper = async (
      patch: (f: {
        id: string
        review: Record<string, unknown> & { moves: Array<Record<string, unknown>> }
      }) => void,
    ) => {
      const f = JSON.parse(exportJson(id, pgn, review))
      patch(f)
      return importJson(JSON.stringify(f))
    }
    await expect(tamper((f) => (f.review.moves[3]!.san = 'Qh5'))).rejects.toThrow(/move 4 does not match/)
    await expect(tamper((f) => (f.review.moves[3]!.label = 'Superb'))).rejects.toThrow(/unknown label/)
    await expect(tamper((f) => (f.review.moves[3]!.loss = 'lots'))).rejects.toThrow(/malformed/)
    await expect(tamper((f) => (f.review.fens = []))).rejects.toThrow(/positions do not match/)
    await expect(tamper((f) => (f.id = 'deadbeefdeadbeef'))).rejects.toThrow(/id does not match/)
    await expect(tamper((f) => (f.review.white = 42))).rejects.toBeInstanceOf(ReviewFileError)
  })
})
