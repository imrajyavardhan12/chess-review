// Measures the tactic detectors in packages/core/src/tactics against the Lichess puzzle database,
// whose puzzles carry theme tags (fork, pin, skewer, ...). For every puzzle, the first move is the
// mistake and the rest is the line that punishes it: exactly what the "allowed" explanations read.
//
//   node --experimental-transform-types --no-warnings --import ./scripts/ts-hooks.mjs \
//     scripts/tactics-eval.ts puzzles.ndjson [limit] [--examples kind]
//
// Input: one JSON object per line with the Lichess CSV fields PuzzleId, FEN, Moves and Themes
// (the CC0 puzzle database: https://database.lichess.org/#puzzles). Output: per motif, how often the
// detector fired, its precision against the tags, and its recall.
import { readFileSync } from 'node:fs'
import { findMotif, replay, type MotifKind } from '../packages/core/src/index.ts'
import { isBackRankMate } from '../packages/core/src/tactics/explain.ts'

type Kind = MotifKind | 'backRankMate'

/** The Lichess themes that count as agreeing with each detector. */
const AGREES: Record<Kind, string[]> = {
  hanging: ['hangingPiece'],
  fork: ['fork'],
  pin: ['pin'],
  skewer: ['skewer'],
  discoveredAttack: ['discoveredAttack', 'doubleCheck'],
  trappedPiece: ['trappedPiece'],
  overloadedDefender: ['overloading', 'capturingDefender', 'deflection'],
  backRankMate: ['backRankMate'],
}

const [file, limitArg, flag, exampleKind] = process.argv.slice(2)
if (!file) throw new Error('usage: tactics-eval.ts puzzles.ndjson [limit] [--examples kind]')
const limit = Number(limitArg ?? Infinity)

const fired: Record<string, number> = {}
const agreed: Record<string, number> = {}
const tagged: Record<string, number> = {}
const found: Record<string, number> = {}
let n = 0
const examples: string[] = []

for (const row of readFileSync(file, 'utf8').split('\n')) {
  if (!row.trim() || n >= limit) continue
  const p = JSON.parse(row) as { PuzzleId: string; FEN: string; Moves: string; Themes: string }
  const themes = new Set(p.Themes.split(' '))
  const [mistake, ...line] = p.Moves.split(' ')
  const start = replay(p.FEN, [mistake!])[0]
  if (!start) continue
  n++
  const steps = replay(start.after, line)
  const attacker = start.after.split(' ')[1] === 'b' ? 'b' : 'w'
  const motif = findMotif(start.after, steps, attacker)
  const kinds: Kind[] = []
  if (motif) kinds.push(motif.kind)
  if (isBackRankMate(steps)) kinds.push('backRankMate')
  for (const k of Object.keys(AGREES) as Kind[]) {
    const isTagged = AGREES[k].some((t) => themes.has(t))
    if (isTagged) tagged[k] = (tagged[k] ?? 0) + 1
    if (kinds.includes(k)) {
      fired[k] = (fired[k] ?? 0) + 1
      if (isTagged) {
        agreed[k] = (agreed[k] ?? 0) + 1
        found[k] = (found[k] ?? 0) + 1
      } else if (flag === '--examples' && k === exampleKind) {
        examples.push(`${p.PuzzleId} ${start.after} ${line.join(' ')} [${p.Themes}] ${JSON.stringify(motif)}`)
      }
    }
  }
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–')
console.log(`${n} puzzles`)
console.log('motif               fired  precision  recall')
for (const k of Object.keys(AGREES) as Kind[]) {
  const f = fired[k] ?? 0
  console.log(
    `${k.padEnd(19)} ${String(f).padStart(5)}  ${pct(agreed[k] ?? 0, f).padStart(9)}  ${pct(found[k] ?? 0, tagged[k] ?? 0).padStart(6)}`,
  )
}
for (const e of examples.slice(0, 40)) console.log(e)
