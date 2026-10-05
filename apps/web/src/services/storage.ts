import { openDB, type DBSchema } from 'idb'
import { ANALYSIS_VERSION, type PresetName, type Review, type Sides } from '@chessreview/core'

export interface Summary {
  accuracy: Sides<number>
  /** White's win chance, downsampled to about 40 points, for the little trace in the game list. */
  spark: number[]
}

export interface StoredReview {
  id: string
  pgn: string
  review: Review
  summary: Summary
  createdAt: number
}

/** A review the user asked for. Kept until it finishes, so a reload mid-analysis can resume. */
export interface StoredRequest {
  id: string
  pgn: string
  preset: PresetName
  createdAt: number
}

export interface ReviewStore {
  getReview(id: string): Promise<StoredReview | undefined>
  putReview(r: StoredReview): Promise<void>
  summaries(ids: readonly string[]): Promise<Map<string, Summary>>
  getRequest(id: string): Promise<StoredRequest | undefined>
  /** Requests still waiting to finish, e.g. a batch interrupted by closing the tab. */
  allRequests(): Promise<StoredRequest[]>
  putRequest(r: StoredRequest): Promise<void>
  deleteRequest(id: string): Promise<void>
  /** Removes reviews written by an older version of the analysis rules. */
  pruneStale(): Promise<void>
}

export function summarize(review: Review): Summary {
  const ws = review.winSeries
  const step = Math.max(1, Math.ceil(ws.length / 40))
  const spark = ws.filter((_, i) => i % step === 0)
  if ((ws.length - 1) % step !== 0) spark.push(ws[ws.length - 1]!)
  return { accuracy: review.accuracy, spark }
}

export function memoryStore(): ReviewStore {
  const reviews = new Map<string, StoredReview>()
  const requests = new Map<string, StoredRequest>()
  return {
    getReview: async (id) => reviews.get(id),
    putReview: async (r) => void reviews.set(r.id, r),
    summaries: async (ids) =>
      new Map(ids.flatMap((id) => (reviews.has(id) ? [[id, reviews.get(id)!.summary] as const] : []))),
    getRequest: async (id) => requests.get(id),
    allRequests: async () => [...requests.values()],
    putRequest: async (r) => void requests.set(r.id, r),
    deleteRequest: async (id) => void requests.delete(id),
    pruneStale: async () => {
      for (const [id, r] of reviews) if (r.review.schemaVersion !== ANALYSIS_VERSION) reviews.delete(id)
    },
  }
}

interface Schema extends DBSchema {
  reviews: { key: string; value: StoredReview }
  requests: { key: string; value: StoredRequest }
}

/** IndexedDB-backed store. */
export async function indexedDbStore(name = 'chessreview'): Promise<ReviewStore> {
  const db = await openDB<Schema>(name, 1, {
    upgrade(d) {
      d.createObjectStore('reviews', { keyPath: 'id' })
      d.createObjectStore('requests', { keyPath: 'id' })
    },
  })
  return {
    getReview: (id) => db.get('reviews', id),
    putReview: async (r) => void (await db.put('reviews', r)),
    summaries: async (ids) => {
      const out = new Map<string, Summary>()
      const tx = db.transaction('reviews')
      for (const id of ids) {
        const r = await tx.store.get(id)
        if (r) out.set(id, r.summary)
      }
      return out
    },
    getRequest: (id) => db.get('requests', id),
    allRequests: () => db.getAll('requests'),
    putRequest: async (r) => void (await db.put('requests', r)),
    deleteRequest: (id) => db.delete('requests', id),
    pruneStale: async () => {
      const tx = db.transaction('reviews', 'readwrite')
      for (let c = await tx.store.openCursor(); c; c = await c.continue()) {
        if (c.value.review.schemaVersion !== ANALYSIS_VERSION) await c.delete()
      }
      await tx.done
    },
  }
}

/** IndexedDB where available (it is not in some private windows); otherwise memory, so the app still works. */
export async function openStore(): Promise<ReviewStore> {
  try {
    const store = await indexedDbStore()
    await store.pruneStale()
    return store
  } catch (e) {
    console.warn('IndexedDB unavailable, reviews will not persist after this tab closes.', e)
    return memoryStore()
  }
}
