import { loadBook } from '@chessreview/core'
import { LiveAnalysis } from './analysis'
import { ENGINE_ID, createEngineHost, fullEngine } from './engine'
import type { EngineHost } from './engine-host'
import { EngineNotInstalled, FULL_ENGINE_ID } from './full-engine'
import { PuzzleService } from './puzzles'
import { ReviewService } from './reviews'
import { openStore, type ReviewStore } from './storage'

let store: Promise<ReviewStore> | undefined
let service: Promise<ReviewService> | undefined
let puzzles: Promise<PuzzleService> | undefined
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
  service ??= (store ??= openStore()).then((store) => {
    const s = new ReviewService({ store, engine: engineHost, loadBook, engineId: ENGINE_ID })
    // Reviews left unfinished last time (a batch, a closed tab) carry on in the background.
    void s.resumePending()
    return s
  })
  return service
}

/** The app-wide puzzle service. It shares the review store and the shipped engine. */
export function getPuzzleService(): Promise<PuzzleService> {
  return (puzzles ??= (store ??= openStore()).then(
    (s) => new PuzzleService({ store: s, engine: (work) => hostFor(ENGINE_ID).use(work) }),
  ))
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
export { LichessError, fetchLichessGames } from './lichess'
export type { StoredReview, Summary } from './storage'
export type { PuzzleService, SyncProgress } from './puzzles'
