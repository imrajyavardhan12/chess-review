import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { Emitter, type Transport } from './transport'

/** Transport over a native UCI engine process (for tests, tooling and a future CLI). */
export function processTransport(command: string, args: string[] = []): Transport {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] })
  const lines = new Emitter<string>()
  const errors = new Emitter<Error>()
  createInterface({ input: child.stdout }).on('line', (l) => lines.emit(l.trim()))
  child.on('error', (e) => errors.emit(e))
  child.on('exit', (code) => errors.emit(new Error(`engine process exited (${code})`)))
  return {
    send: (line) => child.stdin.write(line + '\n'),
    onLine: (l) => lines.on(l),
    onError: (l) => errors.on(l),
    terminate: () => child.kill(),
  }
}

export type StockfishFlavor = 'lite-single' | 'single' | 'lite' | 'full'

/**
 * Transport over the Stockfish WASM build from the `stockfish` npm package. Each engine runs in
 * its own Node process via the package's CLI entry: the loader can only be initialised once per
 * module instance, and a process per engine also gives a pool real isolation.
 */
export function wasmNodeTransport(flavor: StockfishFlavor = 'lite-single'): Transport {
  const require = createRequire(import.meta.url)
  const dir = dirname(require.resolve('stockfish/package.json'))
  const { buildVersion } = require('stockfish/package.json') as { buildVersion: string }
  const file = {
    full: `stockfish-${buildVersion}.js`,
    single: `stockfish-${buildVersion}-single.js`,
    lite: `stockfish-${buildVersion}-lite.js`,
    'lite-single': `stockfish-${buildVersion}-lite-single.js`,
  }[flavor]
  return processTransport(process.execPath, [join(dir, 'bin', file)])
}
