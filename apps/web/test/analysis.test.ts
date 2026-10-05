import { describe, expect, it } from 'vitest'
import { AnalysisAborted, type AnalyseRequest } from '@chessreview/core'
import type { PoolEngine } from '@chessreview/engine'
import { LiveAnalysis } from '../src/services/analysis'
import { EngineHost } from '../src/services/engine-host'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const limits = { depth: 12, nodes: 1000 }

function setup() {
  const calls: AnalyseRequest[] = []
  const create = async (): Promise<PoolEngine> => ({
    async analyse(req, signal) {
      calls.push(req)
      if (signal?.aborted) throw new AnalysisAborted()
      return { eval: { cp: 31, mate: null }, best: 'e2e4', pv: ['e2e4', 'e7e5'], depth: 12, nodes: 1000 }
    },
    dispose() {},
  })
  return { calls, live: new LiveAnalysis(new EngineHost(create, 1, 10)) }
}

describe('LiveAnalysis', () => {
  it('asks the engine with the given limits and returns its score and line', async () => {
    const { calls, live } = setup()
    expect(await live.analyse(START, limits)).toEqual({
      eval: { cp: 31, mate: null },
      line: ['e2e4', 'e7e5'],
      depth: 12,
    })
    expect(calls).toEqual([{ fen: START, depth: 12, nodes: 1000 }])
  })

  it('remembers positions, so stepping back costs nothing, but not across different limits', async () => {
    const { calls, live } = setup()
    await live.analyse(START, limits)
    await live.analyse(START.replace(' 0 1', ' 5 9'), limits) // same position, other move counters
    expect(calls).toHaveLength(1)
    await live.analyse(START, { depth: 20, nodes: 5000 })
    expect(calls).toHaveLength(2)
  })

  it('scores a finished game without the engine', async () => {
    const { calls, live } = setup()
    const mated = await live.analyse('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', limits)
    expect(mated).toEqual({ eval: { cp: -10_000, mate: 0 }, line: [], depth: 0 })
    const stalemate = await live.analyse('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', limits)
    expect(stalemate.eval).toEqual({ cp: 0, mate: null })
    expect(calls).toHaveLength(0)
  })

  it('stops when cancelled, and does not remember a cancelled search', async () => {
    const { calls, live } = setup()
    const ctl = new AbortController()
    ctl.abort()
    await expect(live.analyse(START, limits, ctl.signal)).rejects.toBeInstanceOf(AnalysisAborted)
    await live.analyse(START, limits)
    expect(calls).toHaveLength(1)
  })
})
