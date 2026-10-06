import { describe, expect, it } from 'vitest'
import {
  AnalysisAborted,
  PV_PLIES,
  evaluatePositions,
  parseGame,
  type AnalyseRequest,
  type Engine,
} from '../src'

const settings = { depth: 5, nodes: 100, hashMb: 1, engine: 'fake' }

/** Engine that always answers with the move the game actually played, counting requests. */
function fakeEngine(game: ReturnType<typeof parseGame>, cp = 0) {
  const calls: AnalyseRequest[] = []
  const bestByFen = new Map(game.moves.map((m) => [m.fenBefore, m.uci]))
  const engine: Engine = {
    async analyse(req) {
      calls.push(req)
      const best = req.searchMoves ? (req.searchMoves[0] ?? null) : (bestByFen.get(req.fen) ?? 'a2a3')
      return {
        eval: { cp: req.searchMoves ? cp - 50 : cp, mate: null },
        best,
        pv: best ? [best, 'h7h6'] : [],
        depth: req.depth,
        nodes: req.nodes,
      }
    },
  }
  return { engine, calls }
}

describe('evaluatePositions', () => {
  const game = parseGame('1. e4 e5 2. Nf3 *')

  it('searches every position once, then re-searches best moves without the played move', async () => {
    const { engine, calls } = fakeEngine(game)
    const records = await evaluatePositions(game, engine, settings)
    expect(records).toHaveLength(4)
    const plain = calls.filter((c) => !c.searchMoves)
    const alt = calls.filter((c) => c.searchMoves)
    expect(plain).toHaveLength(4)
    expect(alt).toHaveLength(3) // one per played move, all matched the "engine"
    for (const a of alt) {
      const played = game.moves.find((m) => m.fenBefore === a.fen)!.uci
      expect(a.searchMoves).not.toContain(played)
      expect(a.searchMoves!.length).toBeGreaterThan(0)
      expect(a.searchMoves).toEqual([...a.searchMoves!].sort()) // canonical order
    }
    expect(records[0]!.secondCp).toBe(-50)
    expect(records[3]!.secondCp).toBeNull() // no move was played from the final position
  })

  it('skips the second search when the position is decided for either side', async () => {
    for (const cp of [2000, -2000]) {
      const { engine, calls } = fakeEngine(game, cp)
      await evaluatePositions(game, engine, settings)
      expect(calls.filter((c) => c.searchMoves)).toHaveLength(0)
    }
  })

  it('scores finished games without calling the engine', async () => {
    const mate = parseGame('1. f3 e5 2. g4 Qh4# 0-1')
    const { engine, calls } = fakeEngine(mate)
    const records = await evaluatePositions(mate, engine, settings)
    const last = records[records.length - 1]!
    expect(last).toMatchObject({ cp: -10_000, mate: 0, best: null, pv: [] })
    expect(calls.some((c) => c.fen === mate.fens[mate.fens.length - 1])).toBe(false)

    const stalemate = parseGame('[SetUp "1"]\n[FEN "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1"]\n\n1. Qf7 1/2-1/2')
    const end = await evaluatePositions(stalemate, fakeEngine(stalemate).engine, settings)
    expect(end[end.length - 1]).toMatchObject({ cp: 0, mate: null, best: null })
  })

  it('keeps the principal variation of the main search, cut to PV_PLIES', async () => {
    const records = await evaluatePositions(game, fakeEngine(game).engine, settings)
    expect(records[0]!.pv).toEqual(['e2e4', 'h7h6']) // not the runner-up search's line
    const long: Engine = {
      analyse: async (req) => ({
        eval: { cp: 0, mate: null },
        best: 'a2a3',
        pv: Array.from({ length: PV_PLIES + 5 }, () => 'a2a3'),
        depth: req.depth,
        nodes: req.nodes,
      }),
    }
    const cut = await evaluatePositions(game, long, settings)
    expect(cut.every((r) => r.pv.length === PV_PLIES)).toBe(true)
  })

  it('reports progress up to the total, once per unit of work', async () => {
    const seen: Array<[number, number]> = []
    await evaluatePositions(game, fakeEngine(game).engine, settings, {
      onProgress: (d, t) => seen.push([d, t]),
    })
    expect(seen[seen.length - 1]).toEqual([7, 7]) // 4 positions + 3 moves
    expect(seen.map(([d]) => d)).toEqual([...seen.keys()].map((i) => i + 1))
  })

  it('stops with AnalysisAborted when cancelled', async () => {
    const ctl = new AbortController()
    ctl.abort()
    await expect(
      evaluatePositions(game, fakeEngine(game).engine, settings, { signal: ctl.signal }),
    ).rejects.toBeInstanceOf(AnalysisAborted)
  })

  it('propagates engine failures instead of swallowing them', async () => {
    const broken: Engine = { analyse: () => Promise.reject(new Error('engine crashed')) }
    await expect(evaluatePositions(game, broken, settings)).rejects.toThrow('engine crashed')
  })
})
