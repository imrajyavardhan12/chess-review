// Reviews a batch of games with the shipped engine (Stockfish WASM, run in Node) and writes the
// reviews as JSON lines, for measuring the review rules and the tactic explanations on real games.
//
//   node --experimental-transform-types --no-warnings --import ./scripts/ts-hooks.mjs \
//     scripts/review-games.ts games.pgn out.ndjson [--preset quick|standard|deep] [--engine lite-single|single] [--workers N]
//
// Input: a PGN file with one or more games. Games already in the output are skipped, so an
// interrupted run continues where it stopped.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { createBook, type BookData } from '../packages/core/src/book.ts'
import {
  buildReview,
  evaluatePositions,
  parseGame,
  settingsFor,
  type PresetName,
} from '../packages/core/src/index.ts'
import { EnginePool, UciEngine } from '../packages/engine/src/index.ts'
import { wasmNodeTransport, type StockfishFlavor } from '../packages/engine/src/node.ts'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1]! : fallback
}
const [input, output] = args
if (!input || !output)
  throw new Error('usage: review-games.ts games.pgn out.ndjson [--preset quick] [--workers N]')
const preset = opt('preset', 'quick') as PresetName
const flavor = opt('engine', 'lite-single') as StockfishFlavor
const workers = Number(opt('workers', String(Math.max(1, availableParallelism() - 1))))

const book = createBook(
  JSON.parse(
    readFileSync(new URL('../packages/core/src/data/openings.json', import.meta.url), 'utf8'),
  ) as BookData,
)
const done = new Set(
  existsSync(output)
    ? readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { pgn: string }).pgn)
    : [],
)
// Split on the blank line before each game's first header.
const pgns = readFileSync(input, 'utf8')
  .split(/\n\s*\n(?=\[)/)
  .map((g) => g.trim())
  .filter(Boolean)

const settings = settingsFor(preset, `stockfish-19-${flavor}`)
const pool = new EnginePool(
  () => UciEngine.start(wasmNodeTransport(flavor), { hashMb: settings.hashMb }),
  workers,
)
let n = 0
for (const pgn of pgns) {
  n++
  if (done.has(pgn)) continue
  const started = Date.now()
  const game = parseGame(pgn)
  const records = await evaluatePositions(game, pool, settings)
  const review = buildReview(game, records, book, settings)
  appendFileSync(output, JSON.stringify({ pgn, review }) + '\n')
  console.log(
    `${n}/${pgns.length} ${review.white} - ${review.black}: ${game.moves.length} plies, ${((Date.now() - started) / 1000).toFixed(0)} s`,
  )
}
pool.dispose()
