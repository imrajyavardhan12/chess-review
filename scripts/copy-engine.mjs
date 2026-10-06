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
// The full engine's loader is small and ships with the site; its 99 MB .wasm is downloaded on
// request from wherever the deployment hosts it (see docs/DEPLOY.md).
const files = [`${flavor}.js`, `${flavor}.wasm`, `stockfish-${buildVersion}-single.js`]
for (const name of files) {
  const from = join(pkg, 'bin', name)
  if (!existsSync(from)) throw new Error(`missing ${from}; run pnpm install`)
  copyFileSync(from, join(out, name))
}
copyFileSync(join(pkg, 'Copying.txt'), join(out, 'COPYING.txt'))
writeFileSync(
  join(out, 'README.txt'),
  `Stockfish.js ${version} (lite and full, single-threaded) by Nathan Rugg and Chess.com, LLC, built from Stockfish
by the Stockfish developers. Licensed GPL-3.0-or-later; see COPYING.txt.
Source: https://github.com/nmrugg/stockfish.js and https://github.com/official-stockfish/Stockfish
`,
)
console.log(`engine: ${files.join(', ')} -> apps/web/public/engine`)
