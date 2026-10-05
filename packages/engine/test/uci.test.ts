import { describe, expect, it } from 'vitest'
import { AnalysisAborted } from '@chessreview/core'
import { EngineError, UciEngine, parseInfo, toWhitePov } from '../src'
import { BLACK_TO_MOVE, FakeTransport, START } from './fake'

describe('parseInfo', () => {
  it('reads depth, nodes, score and pv', () => {
    expect(parseInfo('info depth 12 seldepth 18 multipv 1 score cp -34 nodes 90210 nps 500000 time 180 pv e7e5 g1f3')).toEqual({
      depth: 12,
      nodes: 90210,
      score: { kind: 'cp', value: -34 },
      pv: ['e7e5', 'g1f3'],
    })
  })
  it('reads mate scores and tolerates bound markers', () => {
    expect(parseInfo('info depth 5 score mate -3 nodes 10 pv a1a2')?.score).toEqual({ kind: 'mate', value: -3 })
    expect(parseInfo('info depth 9 score cp 120 lowerbound nodes 77 pv d2d4')?.score).toEqual({ kind: 'cp', value: 120 })
  })
  it('ignores lines without a score and pv', () => {
    expect(parseInfo('info string NNUE evaluation using nn-xyz.nnue')).toBeNull()
    expect(parseInfo('info depth 3 currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
})

describe('toWhitePov', () => {
  it('flips centipawns when Black is to move', () => {
    expect(toWhitePov({ kind: 'cp', value: 40 }, 'w')).toEqual({ cp: 40, mate: null })
    expect(toWhitePov({ kind: 'cp', value: 40 }, 'b')).toEqual({ cp: -40, mate: null })
  })
  it('maps mate scores like python-chess: 10000 minus the distance, signed for White', () => {
    expect(toWhitePov({ kind: 'mate', value: 3 }, 'w')).toEqual({ cp: 9997, mate: 3 })
    expect(toWhitePov({ kind: 'mate', value: -3 }, 'w')).toEqual({ cp: -9997, mate: -3 })
    // Black to move and mating in 2 is a mate *against* White.
    expect(toWhitePov({ kind: 'mate', value: 2 }, 'b')).toEqual({ cp: -9998, mate: -2 })
  })
})

describe('UciEngine', () => {
  it('does the handshake and applies options', async () => {
    const t = new FakeTransport()
    await UciEngine.start(t, { threads: 2, hashMb: 32 })
    expect(t.sent).toEqual(['uci', 'setoption name Threads value 2', 'setoption name Hash value 32', 'isready'])
  })

  it('turns on analysis mode only when the engine offers it', async () => {
    const offers = new FakeTransport((cmd, reply) => {
      if (cmd === 'uci') {
        reply('option name UCI_AnalyseMode type check default false')
        reply('uciok')
      }
      if (cmd === 'isready') reply('readyok')
    })
    await UciEngine.start(offers)
    expect(offers.sent).toContain('setoption name UCI_AnalyseMode value true')

    const plain = new FakeTransport()
    await UciEngine.start(plain)
    expect(plain.sent.some((c) => c.includes('UCI_AnalyseMode'))).toBe(false)
  })

  it('defaults to one thread and 16 MB so results are reproducible', async () => {
    const t = new FakeTransport()
    await UciEngine.start(t)
    expect(t.sent).toContain('setoption name Threads value 1')
    expect(t.sent).toContain('setoption name Hash value 16')
  })

  it('starts each search from a clean slate and sends the limits', async () => {
    const t = new FakeTransport()
    const e = await UciEngine.start(t)
    t.sent.length = 0
    await e.analyse({ fen: START, depth: 14, nodes: 5000 })
    expect(t.sent).toEqual(['ucinewgame', `position fen ${START}`, 'go depth 14 nodes 5000'])
  })

  it('restricts the root moves with searchmoves', async () => {
    const t = new FakeTransport()
    const e = await UciEngine.start(t)
    await e.analyse({ fen: START, depth: 8, nodes: 100, searchMoves: ['a2a3', 'h2h3'] })
    expect(t.sent.at(-1)).toBe('go depth 8 nodes 100 searchmoves a2a3 h2h3')
  })

  it('reports the last info line, from White’s point of view', async () => {
    const e = await UciEngine.start(new FakeTransport())
    const r = await e.analyse({ fen: START, depth: 10, nodes: 1000 })
    expect(r).toEqual({ eval: { cp: 25, mate: null }, best: 'e2e4', depth: 10, nodes: 1000 })

    const b = await e.analyse({ fen: BLACK_TO_MOVE, depth: 10, nodes: 1000 })
    expect(b.eval.cp).toBe(-25) // +25 for Black is -25 for White
  })

  it('takes the final info line when the engine improves its answer', async () => {
    const t = new FakeTransport((cmd, reply) => {
      if (cmd === 'uci') reply('uciok')
      if (cmd === 'isready') reply('readyok')
      if (cmd.startsWith('go')) {
        reply('info depth 5 score cp 10 nodes 100 pv e2e4')
        reply('info depth 6 score cp 60 lowerbound nodes 200 pv d2d4')
        reply('info depth 7 score cp 45 nodes 300 pv d2d4')
        reply('bestmove d2d4')
      }
    })
    const r = await (await UciEngine.start(t)).analyse({ fen: START, depth: 7, nodes: 300 })
    expect(r).toMatchObject({ eval: { cp: 45 }, best: 'd2d4', depth: 7, nodes: 300 })
  })

  it('falls back to the pv when the engine answers "(none)"', async () => {
    const t = new FakeTransport(FakeTransport.polite('info depth 1 score cp 0 nodes 1 pv a2a3', 'bestmove (none)'))
    const r = await (await UciEngine.start(t)).analyse({ fen: START, depth: 1, nodes: 1 })
    expect(r.best).toBe('a2a3')
  })

  it('fails loudly if the engine returns no score', async () => {
    const t = new FakeTransport(FakeTransport.polite('info string hello', 'bestmove e2e4'))
    await expect((await UciEngine.start(t)).analyse({ fen: START, depth: 1, nodes: 1 })).rejects.toBeInstanceOf(EngineError)
  })

  it('runs searches strictly one after another', async () => {
    const t = new FakeTransport()
    const e = await UciEngine.start(t)
    t.sent.length = 0
    await Promise.all([1, 2, 3].map((n) => e.analyse({ fen: START, depth: 5, nodes: n })))
    const gos = t.sent.filter((c) => c.startsWith('go'))
    expect(gos).toEqual(['go depth 5 nodes 1', 'go depth 5 nodes 2', 'go depth 5 nodes 3'])
    // each go is followed by its own position setup before the next go: no interleaving
    expect(t.sent.filter((c) => c === 'ucinewgame')).toHaveLength(3)
  })

  it('cancels a running search with stop and reports AnalysisAborted', async () => {
    const t = new FakeTransport((cmd, reply) => {
      if (cmd === 'uci') reply('uciok')
      if (cmd === 'isready') reply('readyok')
      if (cmd === 'stop') {
        reply('info depth 3 score cp 0 nodes 5 pv e2e4')
        reply('bestmove e2e4')
      }
    })
    const e = await UciEngine.start(t)
    const ctl = new AbortController()
    const p = e.analyse({ fen: START, depth: 30, nodes: 1e9 }, ctl.signal)
    await new Promise((r) => setTimeout(r, 5))
    ctl.abort()
    await expect(p).rejects.toBeInstanceOf(AnalysisAborted)
    expect(t.sent).toContain('stop')
  })

  it('does not even start a search if already cancelled', async () => {
    const t = new FakeTransport()
    const e = await UciEngine.start(t)
    t.sent.length = 0
    const ctl = new AbortController()
    ctl.abort()
    await expect(e.analyse({ fen: START, depth: 5, nodes: 5 }, ctl.signal)).rejects.toBeInstanceOf(AnalysisAborted)
    expect(t.sent).toEqual([])
  })

  it('times out a wedged engine instead of hanging forever', async () => {
    const t = new FakeTransport((cmd, reply) => {
      if (cmd === 'uci') reply('uciok')
      if (cmd === 'isready') reply('readyok')
      // never answers "go"
    })
    const e = await UciEngine.start(t, { searchTimeoutMs: 30 })
    await expect(e.analyse({ fen: START, depth: 5, nodes: 5 })).rejects.toThrow(/Timed out/)
  })

  it('fails the handshake cleanly and terminates the transport', async () => {
    const t = new FakeTransport(() => undefined)
    await expect(UciEngine.start(t, { searchTimeoutMs: 30 })).rejects.toBeInstanceOf(EngineError)
    expect(t.terminated).toBe(true)
  }, 25_000)

  it('rejects in-flight and later searches when the transport dies', async () => {
    const t = new FakeTransport((cmd, reply) => {
      if (cmd === 'uci') reply('uciok')
      if (cmd === 'isready') reply('readyok')
    })
    const e = await UciEngine.start(t)
    const p = e.analyse({ fen: START, depth: 5, nodes: 5 })
    await new Promise((r) => setTimeout(r, 5))
    t.crash('worker crashed')
    await expect(p).rejects.toThrow(/worker crashed/)
    await expect(e.analyse({ fen: START, depth: 5, nodes: 5 })).rejects.toThrow(/worker crashed/)
  })
})
