import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ANALYSIS_VERSION, type Review } from '@chessreview/core'
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
})
