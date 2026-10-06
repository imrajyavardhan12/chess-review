// Explains every Mistake, Blunder, Miss, Great and Brilliant move in a set of reviews (the output of
// review-games.ts) and reports how often an explanation was given, by label and by kind. With
// --print it also prints each explanation with its board, for checking them by hand.
//
//   node --experimental-transform-types --no-warnings --import ./scripts/ts-hooks.mjs \
//     scripts/explain-corpus.ts reviews.ndjson [--print]
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { explainReviewMove, moveName, type Review } from '../packages/core/src/index.ts'

const [file, flag] = process.argv.slice(2)
if (!file) throw new Error('usage: explain-corpus.ts reviews.ndjson [--print]')
const LABELS = ['Blunder', 'Mistake', 'Miss', 'Great', 'Brilliant'] as const

const seen: Record<string, number> = {}
const explained: Record<string, number> = {}
const kinds: Record<string, number> = {}
let k = 0
for (const row of readFileSync(file, 'utf8').split('\n')) {
  if (!row.trim()) continue
  const { review } = JSON.parse(row) as { review: Review }
  const site = review.headers.Site ?? ''
  review.moves.forEach((m, i) => {
    if (!(LABELS as readonly string[]).includes(m.label)) return
    seen[m.label] = (seen[m.label] ?? 0) + 1
    const e = explainReviewMove(review, i)
    if (!e) return
    explained[m.label] = (explained[m.label] ?? 0) + 1
    const key = `${e.kind}/${e.perspective}`
    kinds[key] = (kinds[key] ?? 0) + 1
    if (flag === '--print') {
      k++
      console.log(`#${k} ${site} ${moveName(m)} ${m.label} (best ${m.bestSan}, lost ${m.loss.toFixed(0)}%)`)
      console.log(`   ${e.text}`)
      const san = new Chess(e.fen)
      const line = e.line.map(
        (u) => san.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san,
      )
      console.log(`   line from ${e.fen}: ${line.join(' ')}`)
      console.log(
        new Chess(review.fens[i]!)
          .ascii()
          .split('\n')
          .map((l) => '   ' + l)
          .join('\n'),
      )
    }
  })
}
console.log('label       moves  explained')
for (const l of LABELS) {
  const s = seen[l] ?? 0
  const x = explained[l] ?? 0
  console.log(
    `${l.padEnd(10)} ${String(s).padStart(6)}  ${String(x).padStart(5)} (${s ? Math.round((100 * x) / s) : 0}%)`,
  )
}
console.log(
  Object.entries(kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${kind} ${n}`)
    .join(', '),
)
