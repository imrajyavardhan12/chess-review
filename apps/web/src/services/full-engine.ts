/**
 * The optional full-strength engine: Stockfish 19 with the full NNUE network, bit-identical to
 * native Stockfish. Its .wasm is about 99 MB, more than a static host like Cloudflare Pages takes
 * per file, so the site does not ship it: a deployment points at a copy hosted elsewhere (for
 * example Cloudflare R2) through a manifest, and a user who opts in downloads it once. The file is
 * checked against the manifest's size and SHA-256 before it is kept, in Cache Storage.
 */

export interface EngineManifest {
  /** Where the .wasm is hosted. Its origin is added to the site's connect-src at build time. */
  url: string
  bytes: number
  /** Lower-case hex SHA-256 of the file. */
  sha256: string
}

/** Identifies the full build in review ids, next to "stockfish-19-lite-single". */
export const FULL_ENGINE_ID = 'stockfish-19-single'

/** The manifest this build was configured with, or null when the site offers no full engine. */
export function manifestFrom(env: Record<string, string | undefined>): EngineManifest | null {
  const url = env.VITE_FULL_ENGINE_URL?.trim()
  const bytes = Number(env.VITE_FULL_ENGINE_BYTES)
  const sha256 = env.VITE_FULL_ENGINE_SHA256?.trim().toLowerCase()
  if (!url || !sha256 || !/^[0-9a-f]{64}$/.test(sha256) || !Number.isInteger(bytes) || bytes <= 0) return null
  return { url, bytes, sha256 }
}

export class EngineDownloadError extends Error {
  override name = 'EngineDownloadError'
}

/** A review asked for the full engine on a device where it is not downloaded (or was cleared). */
export class EngineNotInstalled extends Error {
  override name = 'EngineNotInstalled'
  constructor() {
    super(
      'This review uses the accurate engine, which isn’t downloaded in this browser. Download it in Settings, or switch the engine to Standard.',
    )
  }
}

const CACHE = 'chessreview-engines-v1'

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export interface Progress {
  received: number
  total: number
}

/** Downloads, verifies, keeps and removes the full engine. */
export class FullEngineStore {
  private objectUrl: string | null = null

  constructor(
    readonly manifest: EngineManifest,
    private caches: CacheStorage | undefined = globalThis.caches,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  /** The cache key: never fetched, it only names the verified file. */
  private get key(): string {
    return `https://engine.invalid/${this.manifest.sha256}.wasm`
  }

  async installed(): Promise<boolean> {
    if (!this.caches) return false
    return !!(await (await this.caches.open(CACHE)).match(this.key))
  }

  /**
   * Fetches the engine, reporting progress, and stores it only if its size and SHA-256 match the
   * manifest. A cancelled or failed download leaves nothing behind.
   */
  async install(onProgress: (p: Progress) => void = () => undefined, signal?: AbortSignal): Promise<void> {
    if (!this.caches)
      throw new EngineDownloadError('This browser cannot store the engine (no Cache Storage).')
    let res: Response
    try {
      res = await this.fetchImpl(this.manifest.url, { signal, cache: 'no-store' })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new EngineDownloadError(
        'Couldn’t reach the engine download. Check your connection and try again.',
      )
    }
    if (!res.ok || !res.body)
      throw new EngineDownloadError(`The engine download failed (HTTP ${res.status}).`)
    const total = this.manifest.bytes
    const buf = new Uint8Array(total)
    let received = 0
    const reader = res.body.getReader()
    onProgress({ received, total })
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (received + value.length > total) {
        await reader.cancel()
        throw new EngineDownloadError('The engine download is larger than expected, so it was not kept.')
      }
      buf.set(value, received)
      received += value.length
      onProgress({ received, total })
    }
    if (received !== total)
      throw new EngineDownloadError('The engine download was incomplete, so it was not kept.')
    const digest = hex(await crypto.subtle.digest('SHA-256', buf))
    if (digest !== this.manifest.sha256) {
      throw new EngineDownloadError('The engine download did not match its checksum, so it was not kept.')
    }
    const cache = await this.caches.open(CACHE)
    await cache.put(this.key, new Response(new Blob([buf], { type: 'application/wasm' })))
  }

  /** A URL the engine workers can load the verified file from, or null if it is not installed. */
  async url(): Promise<string | null> {
    if (this.objectUrl) return this.objectUrl
    if (!this.caches) return null
    const hit = await (await this.caches.open(CACHE)).match(this.key)
    if (!hit) return null
    this.objectUrl = URL.createObjectURL(await hit.blob())
    return this.objectUrl
  }

  async remove(): Promise<void> {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
    await this.caches?.delete(CACHE)
  }
}
