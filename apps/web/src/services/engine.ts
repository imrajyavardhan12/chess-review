import { HASH_MB } from '@chessreview/core'
import { UciEngine, defaultConcurrency, workerTransport } from '@chessreview/engine'
import { EngineHost } from './engine-host'
import { EngineNotInstalled, FULL_ENGINE_ID, FullEngineStore, manifestFrom } from './full-engine'

/** The engine build the app ships. Part of every review's id, so changing it re-analyses games. */
export const ENGINE_ID = 'stockfish-19-lite-single'

/** The optional full engine, when this deployment is configured with one. */
export const fullEngine: FullEngineStore | null = (() => {
  const manifest = manifestFrom(import.meta.env)
  return manifest ? new FullEngineStore(manifest) : null
})()

/** Which engine a choice in Settings stands for. "accurate" falls back to the shipped one where none is offered. */
export const engineIdFor = (choice: 'standard' | 'accurate'): string =>
  choice === 'accurate' && fullEngine ? FULL_ENGINE_ID : ENGINE_ID

const scriptUrl = (id: string) => new URL(`${import.meta.env.BASE_URL}engine/${id}.js`, document.baseURI)

/**
 * The full engine holds its network in memory per worker (about 500 MB each, against 130 MB for the
 * lite one), so it runs on at most two workers, and one where the device reports 4 GB or less.
 */
export function fullEngineWorkers(cores: number, deviceMemoryGb: number | undefined): number {
  if (deviceMemoryGb !== undefined && deviceMemoryGb <= 4) return 1
  return Math.max(1, Math.min(2, cores))
}

export function createEngineHost(id: string = ENGINE_ID): EngineHost {
  const cores = defaultConcurrency(navigator.hardwareConcurrency)
  if (id !== FULL_ENGINE_ID) {
    return new EngineHost(() => UciEngine.start(workerTransport(scriptUrl(id)), { hashMb: HASH_MB }), cores)
  }
  return new EngineHost(
    async () => {
      const wasm = await fullEngine?.url()
      if (!wasm) throw new EngineNotInstalled()
      // The loader reads where its .wasm is from the hash: here, the verified copy in Cache Storage.
      const url = scriptUrl(id)
      url.hash = encodeURIComponent(wasm)
      return UciEngine.start(workerTransport(url), { hashMb: HASH_MB })
    },
    fullEngineWorkers(cores, (navigator as Navigator & { deviceMemory?: number }).deviceMemory),
  )
}
