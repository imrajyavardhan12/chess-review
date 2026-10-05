// Audits the move labels over a set of reviews (the output of review-games.ts): how often each label
// is given, whether accuracy tracks playing strength, and specific checks on the labels that are
// easiest to get wrong (Great, Brilliant, Miss, mates). Prints a Markdown report.
//
//   node --experimental-transform-types --no-warnings --import ./scripts/ts-hooks.mjs \
//     scripts/label-audit.ts reviews.ndjson [more.ndjson ...] [--examples Great|Brilliant|Miss|SlowMate]
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import {
  LABELS,
  legalUci,
  moveName,
  type Label,
  type MoveReview,
  type Review,
} from '../packages/core/src/index.ts'

const args = process.argv.slice(2)
const ex = args.indexOf('--examples')
const exampleKind = ex >= 0 ? args[ex + 1] : null
const files = args.filter((a, i) => !a.startsWith('--') && (ex < 0 || i !== ex + 1))
if (files.length === 0) throw new Error('usage: label-audit.ts reviews.ndjson [...] [--examples Great]')

const reviews: Review[] = files.flatMap((f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => (JSON.parse(l) as { review: Review }).review),
)

const BANDS = [
  [0, 1400, '< 1400'],
  [1400, 1800, '1400–1799'],
  [1800, 2200, '1800–2199'],
  [2200, 4000, '2200+'],
] as const
const bandOf = (elo: number) => BANDS.find(([lo, hi]) => elo >= lo && elo < hi)?.[2] ?? '?'
const eloOf = (r: Review, color: 'w' | 'b') => Number(r.headers[color === 'w' ? 'WhiteElo' : 'BlackElo'])
const pct = (n: number, d: number) => (d === 0 ? '–' : `${((100 * n) / d).toFixed(1)}%`)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const fenBefore = (r: Review, m: MoveReview) => r.fens[m.ply - 1]!

// ---------- label frequencies, overall and by rating band ----------
const all: { r: Review; m: MoveReview }[] = reviews.flatMap((r) => r.moves.map((m) => ({ r, m })))
const count = (pred: (x: { r: Review; m: MoveReview }) => boolean) => all.filter(pred).length

console.log(`# Label audit\n`)
console.log(
  `${reviews.length} games, ${all.length} moves, settings ${JSON.stringify(reviews[0]?.settings)}.\n`,
)
console.log(`## How often each label is given (per 100 moves)\n`)
console.log(`| Label | All | ${BANDS.map((b) => b[2]).join(' | ')} |`)
console.log(`| --- | ---: | ${BANDS.map(() => '---:').join(' | ')} |`)
const inBand = BANDS.map((b) => all.filter(({ r, m }) => bandOf(eloOf(r, m.color)) === b[2]))
for (const label of LABELS) {
  const cells = inBand.map((xs) => pct(xs.filter((x) => x.m.label === label).length, xs.length))
  console.log(
    `| ${label} | ${pct(
      count(({ m }) => m.label === label),
      all.length,
    )} | ${cells.join(' | ')} |`,
  )
}
console.log(`| _moves_ | ${all.length} | ${inBand.map((xs) => xs.length).join(' | ')} |\n`)

// ---------- accuracy against strength ----------
const players = reviews
  .flatMap((r) =>
    (['w', 'b'] as const).map((c) => ({
      elo: eloOf(r, c),
      acc: r.accuracy[c === 'w' ? 'white' : 'black'],
      won: r.result === (c === 'w' ? '1-0' : '0-1'),
      lost: r.result === (c === 'w' ? '0-1' : '1-0'),
    })),
  )
  .filter((p) => Number.isFinite(p.elo) && p.acc !== null) as {
  elo: number
  acc: number
  won: boolean
  lost: boolean
}[]

function pearson(xs: number[], ys: number[]) {
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my)
    sxx += (x - mx) ** 2
    syy += (ys[i]! - my) ** 2
  })
  return sxy / Math.sqrt(sxx * syy)
}
console.log(`## Does accuracy track strength and results?\n`)
console.log(`| Rating | Players | Mean accuracy |`)
console.log(`| --- | ---: | ---: |`)
for (const [lo, hi, name] of BANDS) {
  const ps = players.filter((p) => p.elo >= lo && p.elo < hi)
  console.log(`| ${name} | ${ps.length} | ${mean(ps.map((p) => p.acc)).toFixed(1)} |`)
}
console.log(
  `\nCorrelation of accuracy with rating: r = ${pearson(
    players.map((p) => p.elo),
    players.map((p) => p.acc),
  ).toFixed(2)} (${players.length} player-games).`,
)
console.log(
  `Mean accuracy of the winner ${mean(players.filter((p) => p.won).map((p) => p.acc)).toFixed(1)}, of the loser ${mean(players.filter((p) => p.lost).map((p) => p.acc)).toFixed(1)}.`,
)
const decisive = reviews.filter((r) => r.result === '1-0' || r.result === '0-1')
const higherWon = decisive.filter((r) => {
  const w = r.accuracy.white ?? 0
  const b = r.accuracy.black ?? 0
  return r.result === '1-0' ? w > b : b > w
}).length
console.log(
  `In ${pct(higherWon, decisive.length)} of ${decisive.length} decisive games the more accurate player won.\n`,
)

// ---------- Great ----------
const isCapture = (san: string) => san.includes('x')
const to = (uci: string) => uci.slice(2, 4)
function greatKind(r: Review, m: MoveReview): string {
  const prev = r.moves[m.ply - 2]
  const fen = fenBefore(r, m)
  if (legalUci(fen).length === 1) return 'the only legal move'
  if (prev && isCapture(prev.san) && isCapture(m.san) && to(prev.uci) === to(m.uci)) return 'a recapture'
  if (new Chess(fen).inCheck()) return 'a way out of check'
  return 'other'
}
const greats = all.filter(({ m }) => m.label === 'Great')
const greatKinds: Record<string, number> = {}
for (const { r, m } of greats) greatKinds[greatKind(r, m)] = (greatKinds[greatKind(r, m)] ?? 0) + 1
console.log(`## Great moves (${greats.length})\n`)
console.log(`Great means: the engine's choice, the runner-up at least 20 points of win chance worse, in a`)
console.log(`position between 25% and 75%. What kind of move earns it:\n`)
console.log(`| Kind | Count | Share |`)
console.log(`| --- | ---: | ---: |`)
for (const [k, n] of Object.entries(greatKinds).sort((a, b) => b[1] - a[1]))
  console.log(`| ${k} | ${n} | ${pct(n, greats.length)} |`)
console.log()

// ---------- Brilliant ----------
const brilliants = all.filter(({ m }) => m.label === 'Brilliant')
console.log(`## Brilliant moves (${brilliants.length})\n`)
console.log(
  `${pct(brilliants.length, all.length)} of moves; ${pct(brilliants.filter(({ m }) => m.loss === 0).length, brilliants.length)} were the engine's own choice; mean win chance before ${mean(brilliants.map(({ m }) => m.winBefore)).toFixed(0)}%, after ${mean(brilliants.map(({ m }) => m.winAfter)).toFixed(0)}%.\n`,
)

// ---------- Miss ----------
const misses = all.filter(({ m }) => m.label === 'Miss')
const gaveBackMore = misses.filter(({ r, m }) => m.loss > (r.moves[m.ply - 2]?.loss ?? 0)).length
console.log(`## Misses (${misses.length})\n`)
console.log(
  `A Miss is a mistake or blunder right after the opponent's own (10+ points), from an even or better position. In ${pct(gaveBackMore, misses.length)} of them the player gave back more than the opponent had given (the Miss also threw the game away).\n`,
)

// ---------- mates ----------
const slowMates = all.filter(
  ({ m }) =>
    m.winBefore > 99 && m.winAfter > 97 && ['Inaccuracy', 'Mistake', 'Blunder', 'Miss'].includes(m.label),
)
console.log(`## Winning positions\n`)
console.log(
  `Moves that kept a won position (99%+ before, 97%+ after) yet were labelled Inaccuracy or worse: ${slowMates.length}.\n`,
)

// ---------- examples ----------
if (exampleKind) {
  const pick: Record<string, (x: { r: Review; m: MoveReview }) => boolean> = {
    Great: ({ m }) => m.label === 'Great',
    Brilliant: ({ m }) => m.label === 'Brilliant',
    Miss: ({ m }) => m.label === 'Miss',
    SlowMate: (x) => slowMates.includes(x),
  }
  console.log(`## Examples: ${exampleKind}\n`)
  for (const { r, m } of all.filter(pick[exampleKind] ?? (() => false))) {
    const extra = exampleKind === 'Great' ? ` (${greatKind(r, m)}, gap ${m.gap?.toFixed(0)})` : ''
    console.log(
      `- ${r.headers.Site ?? ''} ${moveName(m)} ${m.label as Label}${extra}: win ${m.winBefore.toFixed(0)}% → ${m.winAfter.toFixed(0)}%, best ${m.bestSan} — \`${fenBefore(r, m)}\``,
    )
  }
}
