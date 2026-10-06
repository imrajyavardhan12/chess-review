import { parseGame } from './pgn'
import { ANALYSIS_VERSION } from './rules'
import { reviewKey } from './settings'
import { LABELS, PHASES, type Label, type MoveReview, type Review } from './types'

/** Numeric annotation glyphs (PGN standard) for the labels that have one. */
export const NAG: Partial<Record<Label, string>> = {
  Brilliant: '$3', // !!
  Great: '$1', // !
  Inaccuracy: '$6', // ?!
  Mistake: '$2', // ?
  Blunder: '$4', // ??
}

const nagOf = (m: MoveReview): string | undefined =>
  m.label === 'Miss' ? (m.loss > 20 ? '$4' : '$2') : NAG[m.label]

/** Engine score as PGN's `[%eval]` command expects: pawns from White's side, or #N for mate. None once the game is over. */
function evalCommand(e: { cp: number; mate: number | null }): string | null {
  if (e.mate === 0) return null
  if (e.mate !== null) return `[%eval #${e.mate}]`
  return `[%eval ${(e.cp / 100).toFixed(2)}]`
}

const clk = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `[%clk ${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}]`
}

const escapeComment = (s: string) => s.replace(/[{}]/g, '')
const header = (k: string, v: string) => `[${k} "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`

/**
 * The review as an annotated PGN: the game's headers, every move with its label as a NAG, and a
 * comment with the engine's evaluation (`[%eval]`), the clock (`[%clk]`) and, for errors, what it
 * cost and the better move. Readable by any PGN tool; chessreview only reads its own JSON back.
 */
export function exportPgn(review: Review): string {
  const h: Record<string, string> = { ...review.headers }
  h.Annotator = 'chessreview'
  if (!h.ECO && review.eco) h.ECO = review.eco
  if (!h.Opening && review.opening) h.Opening = review.opening
  const order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']
  const keys = [...order.filter((k) => k in h), ...Object.keys(h).filter((k) => !order.includes(k))]
  const tokens: string[] = []
  review.moves.forEach((m, i) => {
    if (m.color === 'w') tokens.push(`${m.number}.`)
    else if (i === 0) tokens.push(`${m.number}...`)
    tokens.push(m.san)
    const nag = nagOf(m)
    if (nag) tokens.push(nag)
    const parts: string[] = []
    const score = evalCommand(review.evals[i + 1] ?? { cp: 0, mate: null })
    if (score) parts.push(score)
    if (m.clockMs !== null) parts.push(clk(m.clockMs))
    if (m.label === 'Mistake' || m.label === 'Blunder' || m.label === 'Miss' || m.label === 'Inaccuracy') {
      parts.push(
        escapeComment(
          `${m.label}: gave up ${Math.round(m.loss)}% of win chance.${m.bestSan ? ` Best was ${m.bestSan}.` : ''}`,
        ),
      )
    } else if (m.label === 'Brilliant' || m.label === 'Great' || m.label === 'Book') {
      parts.push(`${m.label} move.`)
    }
    if (parts.length) tokens.push(`{ ${parts.join(' ')} }`)
  })
  tokens.push(review.result)
  const lines: string[] = []
  let line = ''
  for (const t of tokens) {
    if (line && line.length + t.length + 1 > 79) {
      lines.push(line)
      line = t
    } else line = line ? `${line} ${t}` : t
  }
  if (line) lines.push(line)
  return `${keys.map((k) => header(k, h[k]!)).join('\n')}\n\n${lines.join('\n')}\n`
}

/** The JSON a review is exported as and imported from. */
export interface ReviewFile {
  format: 'chessreview-review'
  version: 1
  id: string
  pgn: string
  review: Review
}

export function exportJson(id: string, pgn: string, review: Review): string {
  const file: ReviewFile = { format: 'chessreview-review', version: 1, id, pgn, review }
  return JSON.stringify(file)
}

export class ReviewFileError extends Error {
  override name = 'ReviewFileError'
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

/**
 * Reads an exported review back, checking everything it can, because the file is untrusted: the
 * format, the analysis version, that the review describes the PGN it came with, every field's type,
 * and that the id is the one the review's own settings give. Throws ReviewFileError with a reason.
 */
export async function importJson(text: string): Promise<{ id: string; pgn: string; review: Review }> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ReviewFileError('That file is not a chessreview review (it is not JSON).')
  }
  const fail = (why: string): never => {
    throw new ReviewFileError(`That review file can’t be used: ${why}.`)
  }
  if (!isObj(raw) || raw.format !== 'chessreview-review') fail('it is not a chessreview review')
  const f = raw as Record<string, unknown>
  if (f.version !== 1) fail('it comes from a newer version of chessreview')
  if (!isStr(f.pgn) || !isObj(f.review)) fail('it is incomplete')
  const r = f.review as Record<string, unknown>
  if (r.schemaVersion !== ANALYSIS_VERSION) {
    fail(
      `it was made with older analysis rules (version ${String(r.schemaVersion)}); review the game again instead`,
    )
  }
  const pgn = f.pgn as string
  let game
  try {
    game = parseGame(pgn)
  } catch {
    return fail('its PGN can’t be read')
  }
  const s = r.settings
  if (!isObj(s) || !isNum(s.depth) || !isNum(s.nodes) || !isNum(s.hashMb) || !isStr(s.engine))
    fail('its settings are missing')
  for (const k of ['white', 'black', 'result', 'opening', 'eco'] as const)
    if (!isStr(r[k])) fail(`its ${k} is missing`)
  if (!isObj(r.headers) || !Object.values(r.headers).every(isStr)) fail('its headers are malformed')
  const fens = r.fens
  const evals = r.evals
  const moves = r.moves
  const n = game.moves.length
  if (!Array.isArray(fens) || fens.length !== n + 1 || fens.some((x, i) => x !== game.fens[i]))
    fail('its positions do not match its PGN')
  if (
    !Array.isArray(evals) ||
    evals.length !== n + 1 ||
    !evals.every((e) => isObj(e) && isNum(e.cp) && (e.mate === null || isNum(e.mate)))
  )
    fail('its evaluations are malformed')
  if (!Array.isArray(r.winSeries) || r.winSeries.length !== n + 1 || !r.winSeries.every(isNum))
    fail('its win chances are malformed')
  if (!Array.isArray(moves) || moves.length !== n) fail('its moves do not match its PGN')
  ;(moves as unknown[]).forEach((m, i) => {
    const g = game.moves[i]!
    if (!isObj(m) || m.uci !== g.uci || m.san !== g.san || m.ply !== g.ply)
      fail(`move ${i + 1} does not match its PGN`)
    const mv = m as Record<string, unknown>
    if (!LABELS.includes(mv.label as Label) || !PHASES.includes(mv.phase as (typeof PHASES)[number]))
      fail(`move ${i + 1} has an unknown label`)
    for (const k of ['winBefore', 'winAfter', 'loss', 'cpLoss', 'accuracy'] as const)
      if (!isNum(mv[k])) fail(`move ${i + 1} is malformed`)
    if (!isStr(mv.bestSan) || !isStr(mv.bestUci)) fail(`move ${i + 1} is malformed`)
  })
  for (const k of ['accuracy', 'acpl', 'ratingEstimate'] as const) {
    const v = r[k]
    if (!isObj(v) || !isNum(v.white) || !isNum(v.black)) fail(`its ${k} is malformed`)
  }
  if (!isObj(r.counts) || !isObj(r.phases)) fail('its totals are malformed')
  const review = r as unknown as Review
  const id = await reviewKey(pgn, review.settings)
  if (f.id !== id) fail('its id does not match its game and settings')
  return { id, pgn, review }
}
