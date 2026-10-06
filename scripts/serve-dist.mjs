// Static server for apps/web/dist that applies public/_headers and falls back to index.html,
// the way Cloudflare Pages does. Used for local checks and the end-to-end tests, so they run
// under the same Content-Security-Policy as production.
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL(`../apps/web/${process.env.DIST ?? 'dist'}/`, import.meta.url))
const port = Number(process.env.PORT ?? 4173)
const host = process.env.HOST ?? '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

/** Parses the Cloudflare `_headers` format: a path pattern, then indented `Name: value` lines. */
export function parseHeaders(text) {
  const rules = []
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue
    if (!/^\s/.test(raw)) rules.push({ pattern: raw.trim(), headers: {} })
    else {
      const i = raw.indexOf(':')
      rules.at(-1).headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim()
    }
  }
  return rules
}

const matches = (pattern, path) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(path)

export function start() {
  const rules = parseHeaders(readFileSync(join(dist, '_headers'), 'utf8'))
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = normalize(join(dist, path))
    if (!file.startsWith(dist)) return res.writeHead(403).end()
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html') // SPA fallback
    const served = file === join(dist, 'index.html') ? '/index.html' : path
    const headers = { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' }
    for (const r of rules) if (matches(r.pattern, served)) Object.assign(headers, r.headers)
    res.writeHead(200, headers)
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await start()
  console.log(`serving ${dist} on http://${host}:${port}`)
}
