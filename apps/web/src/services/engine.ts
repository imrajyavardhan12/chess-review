import { HASH_MB } from '@chessreview/core'
import { UciEngine, defaultConcurrency, workerTransport } from '@chessreview/engine'
import { EngineHost } from './engine-host'

/** The engine build the app ships. Part of every review's id, so changing it re-analyses games. */
export const ENGINE_ID = 'stockfish-19-lite-single'

const scriptUrl = () => new URL(`${import.meta.env.BASE_URL}engine/${ENGINE_ID}.js`, document.baseURI)

export function createEngineHost(): EngineHost {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const size = defaultConcurrency(navigator.hardwareConcurrency, memory)
  return new EngineHost(() => UciEngine.start(workerTransport(scriptUrl()), { hashMb: HASH_MB }), size)
}
