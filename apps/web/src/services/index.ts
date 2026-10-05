import { loadBook } from '@chessreview/core'
import { ENGINE_ID, createEngineHost } from './engine'
import { ReviewService } from './reviews'
import { openStore } from './storage'

let service: Promise<ReviewService> | undefined

/** The app-wide review service, created on first use. */
export function getReviewService(): Promise<ReviewService> {
  service ??= openStore().then(
    (store) => new ReviewService({ store, host: createEngineHost(), loadBook, engineId: ENGINE_ID }),
  )
  return service
}

export type { JobState } from './reviews'
export { ChessComError, fetchMonth, listMonths, type RemoteGame } from './chesscom'
export type { Summary } from './storage'
