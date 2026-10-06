import { positionKey, sanOf, turnOf } from './chess-util'
import type { OpeningBook } from './book'
import type { ParsedGame, ParsedMove } from './pgn'
import { gamePhase, phaseIndex } from './phase'
import {
  ANALYSIS_VERSION,
  BOOK_MAX_LOSS,
  BRILLIANT_SEE,
  GREAT_GAP,
  GREAT_RANGE,
  LOSS_THRESHOLDS,
  MATE_CP,
} from './rules'
import { see } from './see'
import {
  PHASES,
  type Color,
  type Counts,
  type EngineRecord,
  type Label,
  type MoveReview,
  type Phase,
  type Review,
  type ReviewSettings,
  type Side,
  type Sides,
} from './types'
import { clampCp, estimateRating, gameAccuracy, mean, moveAccuracy, winPercent } from './winchance'

export function classifyByLoss(loss: number, isBest: boolean): Label {
  if (isBest) return 'Best'
  for (const [limit, label] of LOSS_THRESHOLDS) if (loss <= limit) return label
  return 'Blunder'
}

/** Lichess carries an Opening header; chess.com only an ECOUrl slug that runs on into the move list. */
export function openingFromHeaders(h: Record<string, string>): string {
  if (h.Opening) return h.Opening
  const slug = (h.ECOUrl ?? '').replace(/\/+$/, '').split('/').pop() ?? ''
  const words: string[] = []
  for (const w of slug.split('-')) {
    if (/\d/.test(w)) break
    words.push(w)
  }
  while (words.length && ['with', 'and'].includes((words[words.length - 1] ?? '').toLowerCase())) words.pop()
  return words.join(' ')
}

const moverPov = (cp: number, color: Color) => (color === 'w' ? cp : -cp)
const sideOf = (c: Color): Side => (c === 'w' ? 'white' : 'black')

/**
 * True when `mv` captures on the square where the opponent's last move just captured. Taking back
 * is almost always the only sensible move, so it is not "great" however forced it is.
 */
export function isRecapture(prev: ParsedMove | undefined, mv: ParsedMove): boolean {
  return (
    !!prev && prev.san.includes('x') && mv.san.includes('x') && prev.uci.slice(2, 4) === mv.uci.slice(2, 4)
  )
}

/**
 * Builds a review from a parsed game and the engine's records. Pure: no engine, no clock, no I/O,
 * so the same inputs always give the same review.
 */
export function buildReview(
  game: ParsedGame,
  records: readonly EngineRecord[],
  book: OpeningBook,
  settings: ReviewSettings,
): Review {
  if (records.length !== game.fens.length) {
    throw new Error(`expected ${game.fens.length} engine records, got ${records.length}`)
  }
  const winSeries = records.map((r) => winPercent(r.cp))
  const moves: MoveReview[] = []
  let phaseFloor = 0

  game.moves.forEach((mv, i) => {
    const cur = records[i]!
    const next = records[i + 1]!
    const color = mv.color
    let wBefore = winSeries[i]!
    let wAfter = winSeries[i + 1]!
    if (color === 'b') [wBefore, wAfter] = [100 - wBefore, 100 - wAfter]

    const isBest = cur.best === mv.uci
    const loss = isBest ? 0 : Math.max(0, wBefore - wAfter)
    const cpBefore = clampCp(moverPov(cur.cp, color))
    const cpAfter = clampCp(moverPov(next.cp, color))
    const cpLoss = isBest ? 0 : Math.max(0, cpBefore - cpAfter)
    let accuracy = isBest ? 100 : moveAccuracy(wBefore, wAfter)

    let label = classifyByLoss(loss, isBest)
    const prevLoss = moves.length ? moves[moves.length - 1]!.loss : 0
    const gap = cur.secondCp === null ? null : wBefore - winPercent(moverPov(cur.secondCp, color))

    if (book.has(mv.fenAfter) && loss <= BOOK_MAX_LOSS) {
      label = 'Book'
      accuracy = 100
    } else if (
      loss <= 2 &&
      see(mv.fenBefore, mv.uci) <= BRILLIANT_SEE &&
      wBefore < 90 &&
      wAfter >= 45 &&
      !mv.promotion
    ) {
      label = 'Brilliant'
    } else if (
      isBest &&
      gap !== null &&
      gap >= GREAT_GAP &&
      wBefore >= GREAT_RANGE[0] &&
      wBefore <= GREAT_RANGE[1] &&
      !isRecapture(game.moves[i - 1], mv)
    ) {
      label = 'Great'
    } else if ((label === 'Mistake' || label === 'Blunder') && prevLoss >= 10 && wBefore >= 50) {
      label = 'Miss'
    }

    phaseFloor = Math.max(phaseFloor, phaseIndex(gamePhase(mv.fenBefore)))
    moves.push({
      ply: mv.ply,
      color,
      number: mv.number,
      san: mv.san,
      uci: mv.uci,
      bestSan: cur.best ? sanOf(mv.fenBefore, cur.best) : '',
      bestUci: cur.best ?? '',
      winBefore: wBefore,
      winAfter: wAfter,
      loss,
      cpLoss,
      accuracy,
      label,
      phase: PHASES[phaseFloor]!,
      gap,
      clockMs: mv.clockMs,
    })
  })

  let opening: { eco: string; name: string } | undefined
  for (const fen of game.fens) opening = book.name(fen) ?? opening

  const both = <T>(f: (side: Side) => T): Sides<T> => ({ white: f('white'), black: f('black') })
  const mine = (side: Side) => moves.filter((m) => sideOf(m.color) === side)
  const acpl = both((s) => mean(mine(s).map((m) => m.cpLoss)))

  return {
    schemaVersion: ANALYSIS_VERSION,
    settings,
    white: game.headers.White ?? '?',
    black: game.headers.Black ?? '?',
    result: game.headers.Result ?? '*',
    headers: game.headers,
    opening: opening?.name ?? openingFromHeaders(game.headers),
    eco: opening?.eco ?? game.headers.ECO ?? '',
    fens: [...game.fens],
    evals: records.map((r) => ({ cp: r.cp, mate: r.mate })),
    lines: records.map((r) => r.pv),
    winSeries,
    moves,
    accuracy: both((s) => gameAccuracy(winSeries, mine(s), moves.length)),
    counts: both((s) => {
      const out: Counts = {}
      for (const m of mine(s)) out[m.label] = (out[m.label] ?? 0) + 1
      return out
    }),
    phases: both((s) => {
      const out = {} as Record<Phase, number | null>
      for (const p of PHASES) {
        const accs = mine(s)
          .filter((m) => m.phase === p)
          .map((m) => m.accuracy)
        out[p] = accs.length ? mean(accs) : null
      }
      return out
    }),
    acpl,
    ratingEstimate: both((s) => estimateRating(acpl[s])),
  }
}

export { MATE_CP, positionKey, turnOf }
