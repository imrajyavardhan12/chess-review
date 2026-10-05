import { loadBook } from '@chessreview/core'
import { ENGINE_ID, createEngineHost, fullEngine } from './engine'
import type { EngineHost } from './engine-host'
import { EngineNotInstalled, FULL_ENGINE_ID } from './full-engine'
import { ReviewService } from './reviews'
import { openStore } from './storage'

let service: Promise<ReviewService> | undefined
const hosts = new Map<string, EngineHost>()

/** One pool per engine build, made on first use. The full engine must be downloaded first. */
async function engineHost(id: string): Promise<EngineHost> {
  if (id === FULL_ENGINE_ID && !(await fullEngine?.installed())) throw new EngineNotInstalled()
  let host = hosts.get(id)
  if (!host) hosts.set(id, (host = createEngineHost(id)))
  return host
}

/** The app-wide review service, created on first use. */
export function getReviewService(): Promise<ReviewService> {
  service ??= openStore().then(
    (store) => new ReviewService({ store, engine: engineHost, loadBook, engineId: ENGINE_ID }),
  )
  return service
}

export type { JobState } from './reviews'
export { ChessComError, fetchMonth, listMonths, type RemoteGame } from './chesscom'
export { engineIdFor, fullEngine } from './engine'
export { EngineDownloadError, type Progress } from './full-engine'
export type { Summary } from './storage'
