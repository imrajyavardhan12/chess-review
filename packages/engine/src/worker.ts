import { Emitter, type Transport } from './transport'

/**
 * Transport over a Web Worker running a Stockfish.js build. The script takes UCI commands as
 * strings via postMessage and answers the same way; it loads its .wasm from next to itself.
 */
export function workerTransport(scriptUrl: string | URL): Transport {
  const worker = new Worker(scriptUrl)
  const lines = new Emitter<string>()
  const errors = new Emitter<Error>()
  worker.onmessage = (e: MessageEvent<unknown>) => {
    // The engine also posts download-progress objects; only strings are UCI output.
    if (typeof e.data === 'string') for (const l of e.data.split('\n')) lines.emit(l.trim())
  }
  worker.onerror = (e) => errors.emit(new Error(e.message || 'engine worker crashed'))
  return {
    send: (line) => worker.postMessage(line),
    onLine: (l) => lines.on(l),
    onError: (l) => errors.on(l),
    terminate: () => worker.terminate(),
  }
}
