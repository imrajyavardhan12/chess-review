// Fails when the production build grows past its budget. Run after `pnpm build`.
// Sizes are gzip (what users download) except the engine, which hosts may serve uncompressed.
// Raising a budget is fine when the growth is worth it: say why in the pull request.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url))
const KB = 1024

const BUDGETS = [
  // The code every visit downloads before anything renders.
  { name: 'entry script', files: entryScripts, gzip: true, max: 145 * KB },
  { name: 'stylesheets', files: (f) => f.endsWith('.css'), gzip: true, max: 8 * KB },
  // Code loaded on demand, each chunk on its own (the opening book is the big one).
  { name: 'largest lazy chunk', files: lazyScripts, gzip: true, max: 130 * KB, each: true },
  {
    name: 'engine (wasm + loader)',
    files: (f) => f.startsWith('engine/') && /\.(js|wasm)$/.test(f),
    gzip: false,
    max: 2 * KB * KB,
  },
]

function walk(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir, `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  )
}

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const entries = new Set(
  [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
)
function entryScripts(f) {
  return entries.has(f)
}
function lazyScripts(f) {
  return f.startsWith('assets/') && f.endsWith('.js') && !entries.has(f)
}

const files = walk(dist)
const size = (f, gzip) => {
  const bytes = readFileSync(join(dist, f))
  return gzip ? gzipSync(bytes, { level: 9 }).length : bytes.length
}
const fmt = (n) => `${(n / KB).toFixed(1)} KB`

let failed = false
for (const b of BUDGETS) {
  const matched = files.filter(b.files)
  if (matched.length === 0) {
    console.error(`✗ ${b.name}: no files matched; is the build in ${dist}?`)
    failed = true
    continue
  }
  const sizes = matched.map((f) => [f, size(f, b.gzip)])
  const [file, total] = b.each
    ? sizes.reduce((a, c) => (c[1] > a[1] ? c : a))
    : [matched.join(', '), sizes.reduce((s, [, n]) => s + n, 0)]
  const ok = total <= b.max
  failed ||= !ok
  console.log(`${ok ? '✓' : '✗'} ${b.name}: ${fmt(total)} of ${fmt(b.max)}${b.gzip ? ' gzip' : ''} (${file})`)
}
process.exit(failed ? 1 : 0)
