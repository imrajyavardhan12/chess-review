import { loadBook } from '@chessreview/core'
import { LiveAnalysis } from './analysis'
import { ENGINE_ID, createEngineHost, fullEngine } from './engine'
import type { EngineHost } from './engine-host'
import { EngineNotInstalled, FULL_ENGINE_ID } from './full-engine'
import { ReviewService } from './reviews'
import { openStore } from './storage'

let service: Promise<ReviewService> | undefined
let live: LiveAnalysis | undefined
const hosts = new Map<string, EngineHost>()

/** One pool per engine build, made on first use: reviews and live analysis share it. */
function hostFor(id: string): EngineHost {
  let host = hosts.get(id)
  if (!host) hosts.set(id, (host = createEngineHost(id)))
  return host
}

/** The pool for a review's engine. The full engine must be downloaded first. */
async function engineHost(id: string): Promise<EngineHost> {
  if (id === FULL_ENGINE_ID && !(await fullEngine?.installed())) throw new EngineNotInstalled()
  return hostFor(id)
}

/** The app-wide review service, created on first use. */
export function getReviewService(): Promise<ReviewService> {
  service ??= openStore().then(
    (store) => new ReviewService({ store, engine: engineHost, loadBook, engineId: ENGINE_ID }),
  )
  return service
}

/** Live evaluation for positions the user explores, on the shipped engine. */
export function getLiveAnalysis(): LiveAnalysis {
  return (live ??= new LiveAnalysis(hostFor(ENGINE_ID)))
}

export type { JobState } from './reviews'
export type { LiveEval } from './analysis'
export { ChessComError, fetchMonth, listMonths, type RemoteGame } from './chesscom'
export { engineIdFor, fullEngine } from './engine'
export { EngineDownloadError, type Progress } from './full-engine'
export type { StoredReview, Summary } from './storage'
