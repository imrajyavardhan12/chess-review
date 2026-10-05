// Writes the service worker into a finished build: the template in apps/web/sw/, preceded by the
// list of files to keep offline and a version derived from their contents. Any change to the
// build (including its headers) changes the version, which is how browsers learn of an update.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const template = fileURLToPath(new URL('../apps/web/sw/service-worker.js', import.meta.url))

/** Files a review needs offline. Licence texts and the headers file are not fetched by the app. */
const offline = (path) => !path.endsWith('.txt') && path !== '_headers' && path !== 'sw.js'

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )
}

/** The precache manifest for a build directory: sorted relative paths and a content hash. */
export function manifest(dir) {
  const files = walk(dir)
    .map((f) => relative(dir, f).split(sep).join('/'))
    .sort()
  const hash = createHash('sha256')
  for (const f of files) {
    if (f === 'sw.js') continue
    hash
      .update(f)
      .update('\0')
      .update(readFileSync(join(dir, f)))
      .update('\0')
  }
  return {
    version: hash.digest('hex').slice(0, 16),
    // The shell is cached under the directory URL ('./'), because hosts may redirect /index.html to /.
    files: files.filter(offline).map((f) => (f === 'index.html' ? './' : f)),
  }
}

export function writeServiceWorker(dir) {
  const { version, files } = manifest(dir)
  const head = `const VERSION = ${JSON.stringify(version)}\nconst FILES = ${JSON.stringify(files, null, 2)}\n\n`
  writeFileSync(join(dir, 'sw.js'), head + readFileSync(template, 'utf8'))
  return { version, files }
}
