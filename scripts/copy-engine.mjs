// Copies the Stockfish WASM build the app ships into apps/web/public/engine.
// The files come from the `stockfish` npm package (GPL-3.0) and are not committed.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(root, 'apps/web/package.json'))
const pkg = dirname(require.resolve('stockfish/package.json'))
const { buildVersion, version } = require('stockfish/package.json')
const out = join(root, 'apps/web/public/engine')
mkdirSync(out, { recursive: true })

const flavor = `stockfish-${buildVersion}-lite-single`
for (const ext of ['js', 'wasm']) {
  const from = join(pkg, 'bin', `${flavor}.${ext}`)
  if (!existsSync(from)) throw new Error(`missing ${from}; run npm install`)
  copyFileSync(from, join(out, `${flavor}.${ext}`))
}
copyFileSync(join(pkg, 'Copying.txt'), join(out, 'COPYING.txt'))
writeFileSync(
  join(out, 'README.txt'),
  `Stockfish.js ${version} (lite, single-threaded) by Nathan Rugg and Chess.com, LLC, built from Stockfish
by the Stockfish developers. Licensed GPL-3.0-or-later; see COPYING.txt.
Source: https://github.com/nmrugg/stockfish.js and https://github.com/official-stockfish/Stockfish
`,
)
console.log(`engine: ${flavor} -> apps/web/public/engine`)
