// Builds a copy of the site configured with a full engine served by scripts/serve-engine-fixture.mjs,
// for the end-to-end tests of the download, the integrity check and the CSP. Not for deployment.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const web = join(root, 'apps/web')
const require = createRequire(join(web, 'package.json'))
export const wasm = join(
  dirname(require.resolve('stockfish/package.json')),
  'bin',
  'stockfish-19-single.wasm',
)
export const FIXTURE_PORT = 4174

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = readFileSync(wasm)
  const env = {
    ...process.env,
    VITE_FULL_ENGINE_URL: `http://127.0.0.1:${FIXTURE_PORT}/stockfish-19-single.wasm`,
    VITE_FULL_ENGINE_BYTES: String(bytes.length),
    VITE_FULL_ENGINE_SHA256: createHash('sha256').update(bytes).digest('hex'),
  }
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
  const r = spawnSync(
    process.execPath,
    [vite, 'build', '--outDir', 'dist-full-engine', '--logLevel', 'warn'],
    {
      cwd: web,
      env,
      stdio: 'inherit',
    },
  )
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log('built apps/web/dist-full-engine with a full engine at', env.VITE_FULL_ENGINE_URL)
}
