import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PoolEngine } from '@chessreview/engine'
import { EngineHost } from '../src/services/engine-host'

const result = { eval: { cp: 0, mate: null }, best: 'e2e4', depth: 1, nodes: 1 }

describe('EngineHost', () => {
  let created = 0
  let disposed = 0
  const create = async (): Promise<PoolEngine> => {
    created++
    return { analyse: async () => result, dispose: () => void disposed++ }
  }
  beforeEach(() => {
    created = disposed = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('creates no workers until something needs them', () => {
    const host = new EngineHost(create, 2)
    expect(host.running).toBe(false)
    expect(created).toBe(0)
  })

  it('shares one pool between overlapping uses and returns the work’s result', async () => {
    const host = new EngineHost(create, 2, 1000)
    const [a, b] = await Promise.all([
      host.use((e) => e.analyse({ fen: 'x', depth: 1, nodes: 1 })),
      host.use(async (e) => (await e.analyse({ fen: 'y', depth: 1, nodes: 1 })).best),
    ])
    expect(a).toEqual(result)
    expect(b).toBe('e2e4')
    expect(host.running).toBe(true)
  })

  it('tears workers down after the idle period, and rebuilds them on demand', async () => {
    const host = new EngineHost(create, 1, 1000)
    await host.use((e) => e.analyse({ fen: 'x', depth: 1, nodes: 1 }))
    expect(disposed).toBe(0)
    vi.advanceTimersByTime(999)
    expect(host.running).toBe(true)
    vi.advanceTimersByTime(2)
    expect(host.running).toBe(false)
    expect(disposed).toBe(1)
    await host.use((e) => e.analyse({ fen: 'x', depth: 1, nodes: 1 }))
    expect(created).toBe(2)
  })

  it('does not tear down while work is still running, and restarts the idle clock after', async () => {
    const host = new EngineHost(create, 1, 1000)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const long = host.use(async (e) => (await gate, e.analyse({ fen: 'x', depth: 1, nodes: 1 })))
    vi.advanceTimersByTime(5000)
    expect(host.running).toBe(true)
    release()
    await long
    vi.advanceTimersByTime(1001)
    expect(host.running).toBe(false)
  })

  it('releases the host even if the work throws', async () => {
    const host = new EngineHost(create, 1, 1000)
    await expect(host.use(async () => Promise.reject(new Error('nope')))).rejects.toThrow('nope')
    vi.advanceTimersByTime(1001)
    expect(host.running).toBe(false)
  })
})
