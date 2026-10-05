import { describe, expect, it } from 'vitest'
import { EngineDownloadError, FullEngineStore, manifestFrom } from '../src/services/full-engine'

/** Cache Storage in memory, enough for the store. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  const caches = {
    async open(name: string) {
      const m = stores.get(name) ?? new Map<string, Response>()
      stores.set(name, m)
      return {
        match: async (key: string) => m.get(key)?.clone(),
        put: async (key: string, res: Response) => void m.set(key, res),
      }
    },
    delete: async (name: string) => stores.delete(name),
  }
  return { caches: caches as unknown as CacheStorage, stores }
}

const bytes = new TextEncoder().encode('not really an engine, but it will do for a test')
const sha = async (b: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')

/** Serves `body` in small chunks, like a network would. */
const serve =
  (body: Uint8Array, status = 200): typeof fetch =>
  async () =>
    new Response(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < body.length; i += 7) c.enqueue(body.slice(i, i + 7))
          c.close()
        },
      }),
      { status },
    )

async function setup(body: Uint8Array = bytes, status = 200) {
  const { caches, stores } = fakeCaches()
  const manifest = { url: 'https://engines.example/sf.wasm', bytes: bytes.length, sha256: await sha(bytes) }
  return { store: new FullEngineStore(manifest, caches, serve(body, status)), stores }
}

describe('engine manifest', () => {
  it('reads the build configuration, and offers nothing when it is incomplete', async () => {
    const sha256 = await sha(bytes)
    expect(
      manifestFrom({
        VITE_FULL_ENGINE_URL: 'https://x/sf.wasm',
        VITE_FULL_ENGINE_BYTES: '99',
        VITE_FULL_ENGINE_SHA256: sha256,
      }),
    ).toEqual({ url: 'https://x/sf.wasm', bytes: 99, sha256 })
    expect(manifestFrom({})).toBeNull()
    expect(
      manifestFrom({
        VITE_FULL_ENGINE_URL: 'https://x',
        VITE_FULL_ENGINE_BYTES: '99',
        VITE_FULL_ENGINE_SHA256: 'abc',
      }),
    ).toBeNull()
    expect(
      manifestFrom({
        VITE_FULL_ENGINE_URL: 'https://x',
        VITE_FULL_ENGINE_BYTES: 'lots',
        VITE_FULL_ENGINE_SHA256: sha256,
      }),
    ).toBeNull()
  })
})

describe('FullEngineStore', () => {
  it('downloads with progress, verifies the checksum, and keeps the file', async () => {
    const { store } = await setup()
    expect(await store.installed()).toBe(false)
    const seen: number[] = []
    await store.install((p) => seen.push(p.received))
    expect(seen[0]).toBe(0)
    expect(seen.at(-1)).toBe(bytes.length)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(await store.installed()).toBe(true)
  })

  it('refuses a file that does not match its checksum, and keeps nothing', async () => {
    const tampered = bytes.slice()
    tampered[3] = tampered[3]! ^ 1
    const { store, stores } = await setup(tampered)
    await expect(store.install()).rejects.toThrow(/did not match its checksum/)
    expect(await store.installed()).toBe(false)
    expect([...stores.values()].every((m) => m.size === 0)).toBe(true)
  })

  it('refuses a file of the wrong size', async () => {
    const short = await setup(bytes.slice(0, 10))
    await expect(short.store.install()).rejects.toThrow(/incomplete/)
    const long = await setup(new Uint8Array([...bytes, 1, 2, 3]))
    await expect(long.store.install()).rejects.toThrow(/larger than expected/)
  })

  it('reports a failed download in plain words', async () => {
    const { store } = await setup(bytes, 404)
    await expect(store.install()).rejects.toBeInstanceOf(EngineDownloadError)
    await expect(store.install()).rejects.toThrow('HTTP 404')
  })

  it('removes the file again', async () => {
    const { store } = await setup()
    await store.install()
    await store.remove()
    expect(await store.installed()).toBe(false)
  })

  it('says it cannot store the engine where Cache Storage is missing', async () => {
    const store = new FullEngineStore({ url: 'x', bytes: 1, sha256: 'a'.repeat(64) }, undefined, serve(bytes))
    expect(await store.installed()).toBe(false)
    await expect(store.install()).rejects.toThrow(/cannot store the engine/)
  })
})
