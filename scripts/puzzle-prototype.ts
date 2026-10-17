// Measures how many of a player's mistakes turn into good puzzles, and prints the ones that do.
//
//   pnpm puzzle-prototype reviews.ndjson <player> [--depth 18] [--nodes 3000000] [--workers N]
//
// Input: the output of `pnpm review-games`. Candidates come from the reviews; each is then searched
// again, deeper, and kept only if its best move is still best and the only good one.
import { readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import {
  dedupeByPosition,
  puzzleCandidates,
  sideOf,
  verifyPuzzle,
  type PuzzleCandidate,
  type Review,
} from '../packages/core/src/index.ts'
import { EnginePool, UciEngine } from '../packages/engine/src/index.ts'
import { wasmNodeTransport } from '../packages/engine/src/node.ts'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1]! : fallback
}
const [input, player] = args
if (!input || !player) throw new Error('usage: puzzle-prototype.ts reviews.ndjson <player>')
const limits = { depth: Number(opt('depth', '18')), nodes: Number(opt('nodes', '3000000')) }
const workers = Number(opt('workers', String(Math.max(1, availableParallelism() - 1))))

const reviews = readFileSync(input, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => (JSON.parse(l) as { review: Review }).review)

let errors = 0
const found: PuzzleCandidate[] = []
for (const r of reviews) {
  const side = sideOf(r, player)
  if (!side) continue
  errors += r.moves.filter((m) => m.color === (side === 'white' ? 'w' : 'b') && m.loss >= 10).length
  found.push(...puzzleCandidates(r, side))
}
const candidates = dedupeByPosition(found)
console.log(`${reviews.length} games, ${errors} errors of 10+ points, ${candidates.length} candidates`)

const pool = new EnginePool(() => UciEngine.start(wasmNodeTransport('lite-single'), { hashMb: 16 }), workers)
const kept = (await Promise.all(candidates.map((c) => verifyPuzzle(c, pool, limits)))).filter(
  (p) => p !== null,
)
pool.dispose()

console.log(`${kept.length} of ${candidates.length} candidates are clear puzzles\n`)
for (const p of kept.sort((a, b) => b.gap - a.gap)) {
  console.log(
    `${p.phase.padEnd(10)} ${p.label.padEnd(7)} played ${p.playedSan.padEnd(7)} best ${p.solutionSan.padEnd(7)} ` +
      `lead ${p.gap.toFixed(0).padStart(2)}  ${p.fen}`,
  )
}
