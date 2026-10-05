// Builds packages/core/src/data/openings.json from data/openings.tsv (Lichess chess-openings, CC0).
// Run with `pnpm data`; the output is committed and a test checks it is up to date.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const key = (fen) => fen.split(' ').slice(0, 4).join(' ')

export function buildBook(tsv) {
  const positions = new Set()
  const named = {}
  for (const line of tsv.split('\n').slice(1)) {
    if (!line.trim()) continue
    const [eco, name, pgn] = line.split('\t')
    const chess = new Chess()
    for (const tok of pgn.split(/\s+/)) {
      if (!tok || /^\d+\.$/.test(tok)) continue
      chess.move(tok)
      positions.add(key(chess.fen()))
    }
    named[key(chess.fen())] = [eco, name]
  }
  return { version: 1, positions: [...positions].sort(), named }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const book = buildBook(readFileSync(`${root}data/openings.tsv`, 'utf8'))
  writeFileSync(`${root}packages/core/src/data/openings.json`, JSON.stringify(book))
  console.log(`${book.positions.length} positions, ${Object.keys(book.named).length} named lines`)
}
