import { describe, expect, it } from 'vitest'
import { InvalidPgnError, emptyBook, legalUci, parseGame, type AnalyseRequest } from '@chessreview/core'
import { EngineError, type PoolEngine } from '@chessreview/engine'
import { EngineHost } from '../src/services/engine-host'
import { ReviewService, type JobState } from '../src/services/reviews'
import { memoryStore, type ReviewStore } from '../src/services/storage'

const PGN = '[White "Ann"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'

/** Deterministic fake: "best" is the first legal move, score zero. `gate` lets a test hold searches open. */
function setup(opts: { gate?: Promise<void>; fail?: string; engineFailure?: boolean } = {}) {
  const calls: AnalyseRequest[] = []
  const create = async (): Promise<PoolEngine> => ({
    async analyse(req) {
      calls.push(req)
      await opts.gate
      if (opts.fail) throw opts.engineFailure ? new EngineError(opts.fail) : new Error(opts.fail)
      const best = legalUci(req.fen)[0] ?? null
      return {
        eval: { cp: 0, mate: null },
        best,
        pv: best ? [best] : [],
        depth: req.depth,
        nodes: req.nodes,
      }
    },
    dispose() {},
  })
  const store = memoryStore()
  const make = (s: ReviewStore = store) =>
    new ReviewService({
      store: s,
      host: new EngineHost(create, 2, 60_000),
      loadBook: async () => emptyBook,
      engineId: 'fake',
      now: () => 1,
    })
  return { calls, store, service: make(), make }
}

const finish = (service: ReviewService, id: string) =>
  new Promise<JobState>((resolve) => {
    const off = service.subscribe(id, (s) => {
      if (s.status !== 'running') {
        off()
        resolve(s)
      }
    })
  })

describe('ReviewService', () => {
  it('reviews a game, stores it, and clears the request', async () => {
    const { service, store, calls } = setup()
    const id = await service.start(PGN, 'quick')
    const state = await finish(service, id)
    expect(state.status).toBe('done')
    if (state.status !== 'done') return
    expect(state.review.moves).toHaveLength(4)
    expect(state.review.settings).toMatchObject({ engine: 'fake', depth: 14 })
    expect((await store.getReview(id))?.review.white).toBe('Ann')
    expect(await store.getRequest(id)).toBeUndefined()
    expect(calls.length).toBeGreaterThan(0)
  })

  it('gives the same id for the same game and preset, and a different one for another preset', async () => {
    const { service } = setup()
    expect(await service.idFor(PGN, 'quick')).toBe(await service.idFor(PGN, 'quick'))
    expect(await service.idFor(PGN, 'quick')).not.toBe(await service.idFor(PGN, 'deep'))
    expect(await service.idFor(PGN, 'quick')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('does no engine work for a game it has already reviewed', async () => {
    const { service, calls } = setup()
    const id = await service.start(PGN, 'quick')
    await finish(service, id)
    const before = calls.length
    expect(await service.start(PGN, 'quick')).toBe(id)
    expect((await service.open(id)).status).toBe('done')
    expect(calls.length).toBe(before)
  })

  it('reports progress up to the total before finishing', async () => {
    const { service } = setup()
    const id = await service.start(PGN, 'quick')
    const seen: JobState[] = []
    const off = service.subscribe(id, (s) => seen.push(s))
    await finish(service, id)
    off()
    const progress = seen.filter((s): s is Extract<JobState, { status: 'running' }> => s.status === 'running')
    const last = progress.at(-1)
    expect(last).toBeDefined()
    expect(last!.done).toBeLessThanOrEqual(last!.total)
    expect(seen.at(-1)?.status).toBe('done')
  })

  it('rejects a PGN it cannot read and leaves nothing behind', async () => {
    const { service, store } = setup()
    await expect(service.start('1. e4 e5 2. Rxd8 *', 'quick')).rejects.toBeInstanceOf(InvalidPgnError)
    expect(await store.getRequest(await service.idFor('1. e4 e5 2. Rxd8 *', 'quick'))).toBeUndefined()
  })

  it('says "missing" for a review it has never heard of', async () => {
    const { service } = setup()
    expect(await service.open('deadbeefdeadbeef')).toEqual({ status: 'missing' })
  })

  it('resumes a review after a reload, from the stored request alone', async () => {
    const gate = new Promise<void>(() => undefined) // first session never finishes: the tab is closed
    const first = setup({ gate })
    const id = await first.service.start(PGN, 'quick')
    expect(await first.store.getRequest(id)).toBeDefined()

    const second = setup()
    await second.store.putRequest((await first.store.getRequest(id))!)
    const state = await finish(second.service, id)
    expect(state.status).toBe('done')
    expect(await second.store.getRequest(id)).toBeUndefined()
  })

  it('cancels a running review and forgets it', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { service, store } = setup({ gate })
    const id = await service.start(PGN, 'quick')
    const outcome = finish(service, id)
    service.cancel(id)
    release()
    expect(await outcome).toEqual({ status: 'missing' })
    expect(await store.getRequest(id)).toBeUndefined()
    expect(await store.getReview(id)).toBeUndefined()
  })

  it('surfaces engine failures but keeps the request so a reload can retry', async () => {
    const { service, store } = setup({ fail: 'worker died' })
    const id = await service.start(PGN, 'quick')
    const state = await finish(service, id)
    expect(state).toMatchObject({ status: 'error', message: expect.stringContaining('worker died') })
    expect(await store.getRequest(id)).toBeDefined()
  })

  it('explains an engine that cannot start in terms the user can act on', async () => {
    const { service } = setup({
      fail: 'Timed out: the engine did not answer the UCI handshake.',
      engineFailure: true,
    })
    const id = await service.start(PGN, 'quick')
    const state = await finish(service, id)
    expect(state).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/engine couldn’t run in this browser.*WebAssembly/),
    })
  })

  it('runs reviews one at a time, in order', async () => {
    const { service } = setup()
    const other = '1. d4 d5 2. c4 e6 *'
    // Started one after the other: concurrent starts have no defined order (each awaits an async hash).
    const a = await service.start(PGN, 'quick')
    const b = await service.start(other, 'quick')
    const order: string[] = []
    await Promise.all([
      finish(service, a).then(() => order.push('a')),
      finish(service, b).then(() => order.push('b')),
    ])
    expect(order).toEqual(['a', 'b'])
  })

  it('stops notifying a listener after it unsubscribes', async () => {
    const { service } = setup()
    const id = await service.start(PGN, 'quick')
    let count = 0
    const off = service.subscribe(id, () => count++)
    await new Promise((r) => setTimeout(r, 0))
    off()
    const at = count
    await finish(service, id)
    expect(count).toBe(at)
  })

  it('parses fixtures the same way the service does', () => {
    expect(parseGame(PGN).moves).toHaveLength(4)
  })
})
