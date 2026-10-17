import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDB } from 'idb'
import { ANALYSIS_VERSION, freshProgress, type PuzzleRecord, type Review } from '@chessreview/core'
import {
  indexedDbStore,
  memoryStore,
  summarize,
  type ReviewStore,
  type StoredReview,
} from '../src/services/storage'

const review = (winSeries: number[], over: Partial<Review> = {}): Review =>
  ({
    schemaVersion: ANALYSIS_VERSION,
    winSeries,
    accuracy: { white: 90, black: 80 },
    ...over,
  }) as unknown as Review
const stored = (id: string, r = review([50, 55, 60])): StoredReview => ({
  id,
  pgn: '1. e4 *',
  review: r,
  summary: summarize(r),
  createdAt: 1,
})

const puzzle = (id: string, attempts = 0): PuzzleRecord => ({
  id,
  player: 'me',
  gameId: 'g',
  opponent: 'you',
  date: null,
  tactic: null,
  checkedWith: { depth: 18, nodes: 1 },
  puzzle: null,
  progress: { ...freshProgress(), attempts },
})

describe('summarize', () => {
  it('keeps short series whole', () => {
    expect(summarize(review([50, 52, 51])).spark).toEqual([50, 52, 51])
  })
  it('downsamples long series to about 40 points and always keeps the last', () => {
    const ws = Array.from({ length: 157 }, (_, i) => i)
    const { spark } = summarize(review(ws))
    expect(spark.length).toBeLessThanOrEqual(41)
    expect(spark[0]).toBe(0)
    expect(spark.at(-1)).toBe(156)
  })
  it('carries the accuracy through', () => {
    expect(summarize(review([50, 50])).accuracy).toEqual({ white: 90, black: 80 })
  })
})

describe.each([
  ['memory', async () => memoryStore()],
  ['indexedDB', async () => indexedDbStore(`test-${Math.random()}`)],
])('%s store', (_, make) => {
  let store: ReviewStore
  beforeEach(async () => {
    store = await make()
  })

  it('round-trips reviews and finds them by id', async () => {
    expect(await store.getReview('a')).toBeUndefined()
    await store.putReview(stored('a'))
    expect((await store.getReview('a'))?.pgn).toBe('1. e4 *')
  })

  it('returns summaries only for reviews that exist', async () => {
    await store.putReview(stored('a'))
    const s = await store.summaries(['a', 'missing'])
    expect([...s.keys()]).toEqual(['a'])
    expect(s.get('a')?.accuracy.white).toBe(90)
  })

  it('lists every stored review', async () => {
    expect(await store.allReviews()).toEqual([])
    await store.putReview(stored('a'))
    await store.putReview(stored('b'))
    expect((await store.allReviews()).map((r) => r.id).sort()).toEqual(['a', 'b'])
  })

  it('stores and deletes requests', async () => {
    await store.putRequest({ id: 'r', pgn: '1. e4 *', preset: 'standard', createdAt: 1 })
    expect((await store.getRequest('r'))?.preset).toBe('standard')
    await store.deleteRequest('r')
    expect(await store.getRequest('r')).toBeUndefined()
  })

  it('prunes reviews from older analysis versions and keeps current ones', async () => {
    await store.putReview(stored('old', review([50], { schemaVersion: ANALYSIS_VERSION - 1 })))
    await store.putReview(stored('new'))
    await store.pruneStale()
    expect(await store.getReview('old')).toBeUndefined()
    expect(await store.getReview('new')).toBeDefined()
  })

  it('stores puzzles, replaces one written again, and keeps them when old reviews are pruned', async () => {
    expect(await store.allPuzzles()).toEqual([])
    await store.putPuzzles([puzzle('a'), puzzle('b')])
    await store.putPuzzles([puzzle('a', 3)])
    await store.putReview(stored('old', review([50], { schemaVersion: ANALYSIS_VERSION - 1 })))
    await store.pruneStale()
    const all = await store.allPuzzles()
    expect(all.map((p) => [p.id, p.progress.attempts]).sort()).toEqual([
      ['a', 3],
      ['b', 0],
    ])
  })
})

describe('upgrading from the first storage version', () => {
  it('keeps the reviews already saved and adds the puzzle store', async () => {
    const name = `upgrade-${Math.random()}`
    const old = await openDB(name, 1, {
      upgrade(d) {
        d.createObjectStore('reviews', { keyPath: 'id' })
        d.createObjectStore('requests', { keyPath: 'id' })
      },
    })
    await old.put('reviews', stored('kept'))
    old.close()
    const store = await indexedDbStore(name)
    expect((await store.getReview('kept'))?.id).toBe('kept')
    await store.putPuzzles([puzzle('p')])
    expect(await store.allPuzzles()).toHaveLength(1)
  })
})
