import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_VERSION,
  emptyBook,
  legalUci,
  reviewGame,
  settingsFor,
  type AnalyseRequest,
  type Engine,
  type PuzzleRecord,
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

  it('stores which side of the tactic the mistake was on, as null when it had none', async () => {
    const s = service(await setup(), engine(-100))
    await s.sync('Ann')
    const [r] = await s.list('ann')
    expect(r!.tactic).toBeNull()
    expect(r!.perspective).toBeNull()
  })

  describe('puzzles made before the side was kept', () => {
    const old = (over: Partial<PuzzleRecord>): PuzzleRecord => ({
      id: 'ann|old',
      player: 'ann',
      gameId: 'game',
      opponent: 'Bob',
      date: null,
      tactic: 'fork',
      checkedWith: { depth: 5, nodes: 100 },
      puzzle: null,
      progress: { box: 0, due: 0, attempts: 0, solved: 0, lastAt: null },
      ...over,
    })

    it('are marked unknown when their review no longer shows that tactic, and not tried again', async () => {
      const store = await setup()
      const s = service(store, engine(-100))
      await s.sync('Ann')
      const [made] = await s.list('ann')
      // The same puzzle as stored by the earlier version: a tactic, no side.
      await store.putPuzzles([{ ...made!, tactic: 'fork', perspective: undefined }])
      const [filled] = await s.list('ann')
      expect(filled).toMatchObject({ tactic: 'fork', perspective: null })
      // Settled, so a later visit reads no review for it.
      const read = store.getReview.bind(store)
      let reads = 0
      store.getReview = (id) => (reads++, read(id))
      await s.list('ann')
      expect(reads).toBe(0)
    })

    /** 1. f3 e5 2. g4?? Qh4#: the engine sees the mate, so the review explains 2. g4 as allowing it. */
    async function mateGame() {
      const pgn = '[White "Ann"]\n[Black "Bob"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1'
      const sees: Engine = {
        async analyse(req) {
          const afterG4 = req.fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2')
          const e = afterG4 ? { cp: -3000, mate: -1 } : { cp: 0, mate: req.fen.includes('6Pq') ? 0 : null }
          return { eval: e, best: afterG4 ? 'd8h4' : null, pv: afterG4 ? ['d8h4'] : [], depth: 1, nodes: 1 }
        },
      }
      const review = await reviewGame(pgn, sees, emptyBook, settingsFor('quick', 'fake'))
      const store = memoryStore()
      await store.putReview({ id: 'mate-game', pgn, review, summary: summarize(review), createdAt: 1 })
      return store
    }

    it('get their side from the review when it still shows that tactic', async () => {
      const store = await mateGame()
      const puzzle = { moveIndex: 2 } as PuzzleRecord['puzzle']
      await store.putPuzzles([old({ gameId: 'mate-game', tactic: 'mate', puzzle })])
      const [r] = await service(store, engine(-100)).list('ann')
      expect(r).toMatchObject({ tactic: 'mate', perspective: 'allowed' })
    })

    it('are marked unknown when the review shows a different tactic from the one stored', async () => {
      const store = await mateGame()
      const puzzle = { moveIndex: 2 } as PuzzleRecord['puzzle']
      await store.putPuzzles([old({ gameId: 'mate-game', tactic: 'fork', puzzle })])
      const [r] = await service(store, engine(-100)).list('ann')
      expect(r!.perspective).toBeNull()
    })

    it('keep no side while their game is missing, so it can still be worked out later', async () => {
      const store = memoryStore()
      await store.putPuzzles([old({ gameId: 'gone', puzzle: { moveIndex: 0 } as PuzzleRecord['puzzle'] })])
      const s = service(store, engine(-100))
      expect((await s.list('ann'))[0]!.perspective).toBeUndefined()
      // The game is reviewed again: the next visit fills it in.
      const mate = await mateGame()
      await store.putReview((await mate.getReview('mate-game'))!)
      await store.putPuzzles([
        old({ gameId: 'mate-game', tactic: 'mate', puzzle: { moveIndex: 2 } as PuzzleRecord['puzzle'] }),
      ])
      expect((await s.list('ann'))[0]).toMatchObject({ perspective: 'allowed' })
    })

    it('are loaded even when working out their side fails', async () => {
      const store = memoryStore()
      await store.putPuzzles([old({ puzzle: { moveIndex: 0 } as PuzzleRecord['puzzle'] })])
      store.getReview = () => Promise.reject(new Error('storage went away'))
      const [r] = await service(store, engine(-100)).list('ann')
      expect(r!.id).toBe('ann|old')
      expect(r!.perspective).toBeUndefined()
    })

    it('keep the answer given while their side was being worked out', async () => {
      const store = await mateGame()
      const puzzle = { moveIndex: 2 } as PuzzleRecord['puzzle']
      const asked = old({ gameId: 'mate-game', tactic: 'mate', puzzle })
      await store.putPuzzles([asked])
      const read = store.getReview.bind(store)
      let answered = false
      store.getReview = async (id) => {
        const got = await read(id)
        if (!answered) {
          answered = true
          // An answer is saved while the review is still being read.
          await store.putPuzzles([
            { ...asked, progress: { box: 2, due: 9, attempts: 3, solved: 2, lastAt: 5 } },
          ])
        }
        return got
      }
      const [r] = await service(store, engine(-100)).list('ann')
      expect(r).toMatchObject({ perspective: 'allowed', progress: { box: 2, solved: 2 } })
    })

    it('reads each game once, however many of its puzzles need a side', async () => {
      const store = await mateGame()
      const puzzle = { moveIndex: 2 } as PuzzleRecord['puzzle']
      await store.putPuzzles([
        old({ id: 'ann|one', gameId: 'mate-game', tactic: 'mate', puzzle }),
        old({ id: 'ann|two', gameId: 'mate-game', tactic: 'mate', puzzle }),
      ])
      const read = store.getReview.bind(store)
      let reads = 0
      store.getReview = (id) => (reads++, read(id))
      const filled = await service(store, engine(-100)).list('ann')
      expect(reads).toBe(1)
      expect(filled.map((r) => r.perspective)).toEqual(['allowed', 'allowed'])
    })

    it('fills in the games it can read when another game fails', async () => {
      const store = await mateGame()
      const puzzle = { moveIndex: 2 } as PuzzleRecord['puzzle']
      await store.putPuzzles([
        old({ id: 'ann|bad', gameId: 'broken', tactic: 'mate', puzzle }),
        old({ id: 'ann|good', gameId: 'mate-game', tactic: 'mate', puzzle }),
      ])
      const read = store.getReview.bind(store)
      store.getReview = (id) => (id === 'broken' ? Promise.reject(new Error('corrupt')) : read(id))
      const byId = new Map((await service(store, engine(-100)).list('ann')).map((r) => [r.id, r]))
      expect(byId.get('ann|good')!.perspective).toBe('allowed')
      expect(byId.get('ann|bad')!.perspective).toBeUndefined()
    })

    it('mark a position that was never kept as a puzzle as unknown without reading any game', async () => {
      const store = memoryStore()
      await store.putPuzzles([old({ puzzle: null })])
      let reads = 0
      store.getReview = () => (reads++, Promise.resolve(undefined))
      const [r] = await service(store, engine(-100)).list('ann')
      expect(reads).toBe(0)
      expect(r!.perspective).toBeNull()
    })

    it('are left alone when they have no tactic', async () => {
      const store = memoryStore()
      await store.putPuzzles([old({ tactic: null })])
      const [r] = await service(store, engine(-100)).list('ann')
      expect(r!.perspective).toBeUndefined()
    })
  })
})
