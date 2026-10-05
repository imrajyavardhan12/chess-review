import { describe, expect, it } from 'vitest'
import { AnalysisAborted, type AnalyseRequest } from '@chessreview/core'
import { EnginePool, EngineError, defaultConcurrency, type PoolEngine } from '../src'

const result = (n: number) => ({ eval: { cp: n, mate: null }, best: 'e2e4', depth: 1, nodes: n })
const req = (nodes: number): AnalyseRequest => ({ fen: 'x', depth: 1, nodes })
const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms))

/** Engine that takes `ms` per search and records how many ran at once across the whole pool. */
function tracker() {
  const state = { active: 0, peak: 0, created: 0, disposed: 0 }
  const create = async (): Promise<PoolEngine> => {
    state.created++
    return {
      async analyse(r) {
        state.active++
        state.peak = Math.max(state.peak, state.active)
        await tick(5)
        state.active--
        return result(r.nodes)
      },
      dispose: () => void state.disposed++,
    }
  }
  return { state, create }
}

describe('EnginePool', () => {
  it('never runs more searches than its size, and returns every result', async () => {
    const { state, create } = tracker()
    const pool = new EnginePool(create, 3)
    const out = await Promise.all(Array.from({ length: 20 }, (_, i) => pool.analyse(req(i))))
    expect(out.map((r) => r.nodes)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(state.peak).toBe(3)
    expect(state.created).toBe(3)
  })

  it('creates engines lazily: one task needs one engine', async () => {
    const { state, create } = tracker()
    const pool = new EnginePool(create, 6)
    await pool.analyse(req(1))
    expect(state.created).toBe(1)
  })

  it('rejects queued work on abort without running it', async () => {
    const { state, create } = tracker()
    const pool = new EnginePool(create, 1)
    const ctl = new AbortController()
    const first = pool.analyse(req(1))
    const queued = pool.analyse(req(2), ctl.signal)
    ctl.abort()
    await expect(queued).rejects.toBeInstanceOf(AnalysisAborted)
    await first
    expect(state.peak).toBe(1)
    await expect(pool.analyse(req(3), ctl.signal)).rejects.toBeInstanceOf(AnalysisAborted)
  })

  it('replaces a crashed engine and retries the task once', async () => {
    let calls = 0
    const create = async (): Promise<PoolEngine> => {
      const crashing = calls++ === 0
      return {
        analyse: async (r) => {
          if (crashing) throw new EngineError('worker died')
          return result(r.nodes)
        },
        dispose: () => undefined,
      }
    }
    const pool = new EnginePool(create, 2)
    await expect(pool.analyse(req(7))).resolves.toMatchObject({ nodes: 7 })
    expect(calls).toBe(2)
  })

  it('gives up and rejects everything when engines keep failing', async () => {
    const create = async (): Promise<PoolEngine> => ({
      analyse: async () => {
        throw new EngineError('always broken')
      },
      dispose: () => undefined,
    })
    const pool = new EnginePool(create, 2, 3)
    const results = await Promise.allSettled([pool.analyse(req(1)), pool.analyse(req(2)), pool.analyse(req(3))])
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
  })

  it('fails tasks if engines cannot even be created', async () => {
    const pool = new EnginePool(() => Promise.reject(new Error('no wasm')), 2, 2)
    await expect(pool.analyse(req(1))).rejects.toThrow('no wasm')
  })

  it('does not treat a cancelled search as an engine failure', async () => {
    const { state, create } = tracker()
    const abortable = async (): Promise<PoolEngine> => {
      const base = await create()
      return {
        analyse: async (r, s) => {
          if (r.nodes === 1) throw new AnalysisAborted()
          return base.analyse(r, s)
        },
        dispose: base.dispose,
      }
    }
    const pool = new EnginePool(abortable, 1)
    await expect(pool.analyse(req(1))).rejects.toBeInstanceOf(AnalysisAborted)
    await expect(pool.analyse(req(2))).resolves.toMatchObject({ nodes: 2 })
    expect(state.created).toBe(1) // the same engine kept going
    expect(state.disposed).toBe(0)
  })

  it('disposes engines and rejects pending and future work', async () => {
    const { state, create } = tracker()
    const pool = new EnginePool(create, 1)
    await pool.analyse(req(1))
    const pending = pool.analyse(req(2))
    const queued = pool.analyse(req(3))
    pool.dispose()
    await expect(queued).rejects.toBeInstanceOf(EngineError)
    await pending.catch(() => undefined)
    expect(state.disposed).toBeGreaterThanOrEqual(1)
    await expect(pool.analyse(req(4))).rejects.toThrow(/disposed/)
  })

  it('rejects an invalid size', () => {
    expect(() => new EnginePool(async () => ({ analyse: async () => result(0), dispose() {} }), 0)).toThrow(RangeError)
  })
})

describe('defaultConcurrency', () => {
  it.each([
    [undefined, 3],
    [1, 1],
    [2, 1],
    [4, 3],
    [8, 6],
    [64, 6],
  ])('%s cores -> %s workers', (cores, expected) => {
    expect(defaultConcurrency(cores)).toBe(expected)
  })
})
