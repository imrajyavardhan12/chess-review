import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_VERSION,
  emptyBook,
  legalUci,
  reviewGame,
  settingsFor,
  type AnalyseRequest,
  type Engine,
} from '@chessreview/core'
import { PuzzleService } from '../src/services/puzzles'
import { memoryStore, summarize, type ReviewStore } from '../src/services/storage'

const PGN = '[White "Ann"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 e5 *'
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * From the start position White is +300 with d4 and -100 with anything else, so 1. e4 is a
 * blunder whose best move d4 beats every other move by a wide margin. `altCp` sets how well the
 * best other move does when searched without d4.
 */
function engine(altCp: number, calls: AnalyseRequest[] = []): Engine {
  return {
    async analyse(req) {
      calls.push(req)
      const atStart = req.fen === START
      if (!atStart) {
        const best = legalUci(req.fen)[0] ?? null
        return { eval: { cp: -100, mate: null }, best, pv: best ? [best] : [], depth: 1, nodes: 1 }
      }
      return req.searchMoves
        ? { eval: { cp: altCp, mate: null }, best: req.searchMoves[0]!, pv: [], depth: 1, nodes: 1 }
        : { eval: { cp: 300, mate: null }, best: 'd2d4', pv: ['d2d4', 'd7d5'], depth: 1, nodes: 1 }
    },
  }
}

async function setup(store: ReviewStore = memoryStore()) {
  const review = await reviewGame(PGN, engine(-100), emptyBook, settingsFor('quick', 'fake'))
  expect(review.schemaVersion).toBe(ANALYSIS_VERSION)
  await store.putReview({ id: 'game', pgn: PGN, review, summary: summarize(review), createdAt: 1 })
  return store
}

const service = (store: ReviewStore, e: Engine, now = () => 1_000) =>
  new PuzzleService({ store, engine: (work) => work(e), now, limits: { depth: 5, nodes: 100 } })

describe('PuzzleService', () => {
  it("turns a player's mistake into a puzzle and remembers where it came from", async () => {
    const s = service(await setup(), engine(-100))
    await s.sync('ANN')
    const [r] = await s.list('ann')
    expect(r).toMatchObject({ gameId: 'game', opponent: 'Bob', player: 'ann' })
    expect(r!.puzzle).toMatchObject({ solution: 'd2d4', playedUci: 'e2e4', fen: START })
    expect(await s.list('Bob')).toEqual([])
  })

  it('searches a position once: a second sync does no work', async () => {
    const calls: AnalyseRequest[] = []
    const s = service(await setup(), engine(-100, calls))
    await s.sync('Ann')
    const n = calls.length
    expect(n).toBeGreaterThan(0)
    await s.sync('Ann')
    expect(calls).toHaveLength(n)
  })

  it('keeps a mistake that is not a clear puzzle, so it is not searched again', async () => {
    const calls: AnalyseRequest[] = []
    const s = service(await setup(), engine(250, calls))
    await s.sync('Ann')
    expect((await s.list('Ann'))[0]!.puzzle).toBeNull()
    const n = calls.length
    await s.sync('Ann')
    expect(calls).toHaveLength(n)
  })

  it('reports progress and saves nothing new when cancelled before it starts', async () => {
    const store = await setup()
    const s = service(store, engine(-100))
    const seen: number[] = []
    await s.sync('Ann', (p) => seen.push(p.done))
    expect(seen).toEqual([0, 1])
    const aborted = new AbortController()
    aborted.abort()
    const fresh = service(await setup(), engine(-100))
    await fresh.sync('Ann', undefined, aborted.signal)
    expect(await fresh.list('Ann')).toEqual([])
  })

  it('records answers on the stored puzzle', async () => {
    const s = service(await setup(), engine(-100), () => 5_000)
    await s.sync('Ann')
    const next = await s.answer((await s.list('Ann'))[0]!, true)
    expect(next.progress).toMatchObject({ attempts: 1, solved: 1, lastAt: 5_000 })
    expect((await s.list('Ann'))[0]!.progress.solved).toBe(1)
  })
})
