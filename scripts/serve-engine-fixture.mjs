// Serves the full engine's .wasm from a second origin, the way R2 or another file host would
// (with CORS), for the end-to-end tests. See build-engine-fixture.mjs. /tampered.wasm is the same
// file with one byte flipped: the right size and the wrong SHA-256.
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { Transform } from 'node:stream'
import { FIXTURE_PORT, wasm } from './build-engine-fixture.mjs'

function flipByte(at) {
  let seen = 0
  return new Transform({
    transform(chunk, _enc, done) {
      if (seen <= at && at < seen + chunk.length) chunk[at - seen] ^= 0xff
      seen += chunk.length
      done(null, chunk)
    },
  })
}

createServer((req, res) => {
  if (req.url === '/health') return res.writeHead(200).end('ok')
  const tampered = req.url === '/tampered.wasm'
  if (req.url !== '/stockfish-19-single.wasm' && !tampered) return res.writeHead(404).end()
  res.writeHead(200, {
    'Content-Type': 'application/wasm',
    'Content-Length': statSync(wasm).size,
    'Access-Control-Allow-Origin': '*',
  })
  const file = createReadStream(wasm)
  ;(tampered ? file.pipe(flipByte(1000)) : file).pipe(res)
}).listen(FIXTURE_PORT, '127.0.0.1', () => console.log(`engine fixture on http://127.0.0.1:${FIXTURE_PORT}`))
