import { loadBook } from '@chessreview/core'
import { LiveAnalysis } from './analysis'
import { ENGINE_ID, createEngineHost } from './engine'
import type { EngineHost } from './engine-host'
import { ReviewService } from './reviews'
import { openStore } from './storage'

let host: EngineHost | undefined
let service: Promise<ReviewService> | undefined
let live: LiveAnalysis | undefined

/** One engine pool for the whole app: reviews and live analysis share it. */
const engineHost = () => (host ??= createEngineHost())

/** The app-wide review service, created on first use. */
export function getReviewService(): Promise<ReviewService> {
  service ??= openStore().then(
    (store) => new ReviewService({ store, host: engineHost(), loadBook, engineId: ENGINE_ID }),
  )
  return service
}

/** Live evaluation for positions the user explores. */
export function getLiveAnalysis(): LiveAnalysis {
  return (live ??= new LiveAnalysis(engineHost()))
}

export type { JobState } from './reviews'
export type { LiveEval } from './analysis'
export { ChessComError, fetchMonth, listMonths, type RemoteGame } from './chesscom'
export type { StoredReview, Summary } from './storage'
