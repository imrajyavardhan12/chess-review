import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { evaluatePositions, parseGame, type EngineRecord, type ReviewSettings } from '@chessreview/core'
import { EnginePool, UciEngine } from '../src'
import { wasmNodeTransport } from '../src/node'

/** Runs the real Stockfish WASM build inside Node. Slower than the unit tests, still self-contained. */

const fixture = (name: string) => fileURLToPath(new URL(`../../core/test/fixtures/${name}.json`, import.meta.url))

describe('real engine (Stockfish 19 lite, WASM in Node)', () => {
  const start = () => UciEngine.start(wasmNodeTransport('lite-single'))

  it('finds a legal move and a sane score for the start position', async () => {
    const e = await start()
    const r = await e.analyse({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 8, nodes: 50_000 })
    expect(r.best).toMatch(/^[a-h][1-8][a-h][1-8]/)
    expect(Math.abs(r.eval.cp)).toBeLessThan(150)
    expect(r.eval.mate).toBeNull()
    e.dispose()
  })

  it('reports mate for the side that mates, in White’s point of view', async () => {
    const e = await start()
    const white = await e.analyse({ fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', depth: 6, nodes: 20_000 })
    expect(white).toMatchObject({ best: 'a1a8', eval: { cp: 9999, mate: 1 } })
    const black = await e.analyse({ fen: 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', depth: 6, nodes: 20_000 })
    expect(black).toMatchObject({ best: 'a8a1', eval: { cp: -9999, mate: -1 } })
    e.dispose()
  })

  it('honours searchmoves', async () => {
    const e = await start()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const r = await e.analyse({ fen, depth: 6, nodes: 20_000, searchMoves: ['a2a3', 'h2h3'] })
    expect(['a2a3', 'h2h3']).toContain(r.best)
    e.dispose()
  })

  it('is deterministic: the same request gives the same answer, however much ran before', async () => {
    const e = await start()
    const req = { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', depth: 12, nodes: 80_000 }
    const first = await e.analyse(req)
    await e.analyse({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 10, nodes: 60_000 })
    expect(await e.analyse(req)).toEqual(first)
    e.dispose()
  })
})

describe('parity with the Python reference (full-strength WASM engine, native-identical)', () => {
  // Same engine version, one thread, 16 MB hash, a fresh game per position and the same node limit:
  // the TypeScript stack must reproduce the recorded native evaluations exactly.
  const names = ['synthetic-stalemate', 'synthetic-underpromotion', 'synthetic-en-passant-castling', 'opera-game-1858']

  it.each(names.filter((n) => existsSync(fixture(n))))('%s', async (name) => {
    const fx = JSON.parse(readFileSync(fixture(name), 'utf8')) as {
      pgn: string
      settings: { depth: number; nodes: number; hash_mb: number }
      infos: Array<{ cp: number; mate: number | null; best: string | null; second_cp: number | null }>
    }
    const settings: ReviewSettings = { depth: fx.settings.depth, nodes: fx.settings.nodes, hashMb: fx.settings.hash_mb, engine: 'full' }
    const pool = new EnginePool(async () => UciEngine.start(wasmNodeTransport('single'), { hashMb: fx.settings.hash_mb }), 3)
    try {
      const records = await evaluatePositions(parseGame(fx.pgn), pool, settings)
      const expected: EngineRecord[] = fx.infos.map((i) => ({ cp: i.cp, mate: i.mate, best: i.best, secondCp: i.second_cp }))
      // Report differences position by position: a bare deep-equal failure is unreadable.
      const diffs = records.flatMap((r, i) =>
        (['cp', 'mate', 'best', 'secondCp'] as const)
          .filter((k) => r[k] !== expected[i]![k])
          .map((k) => `#${i} ${k}: got ${String(r[k])}, python ${String(expected[i]![k])}`),
      )
      expect(diffs).toEqual([])
    } finally {
      pool.dispose()
    }
  }, 240_000)
})
