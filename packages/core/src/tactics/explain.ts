import { Chess } from 'chess.js'
import { turnOf } from '../chess-util'
import { see } from '../see'
import type { Color, Eval, Label, Review } from '../types'
import { Board, PIECE_NAME, VALUE, other, sideName, type PieceType } from './board'
import { gain, outcome, replay, type Step } from './line'
import { findMotif, type Motif, type Placed } from './motifs'

export type TacticKind = Motif['kind'] | 'mate' | 'backRankMate' | 'material' | 'sacrifice' | 'recapture'

/**
 * Whose tactic it is, seen from the player who made the move:
 * `allowed` the move lets the opponent do it, `missed` the best move would have done it,
 * `played` the move itself does it.
 */
export type Perspective = 'allowed' | 'missed' | 'played'

export interface Explanation {
  kind: TacticKind
  perspective: Perspective
  /** One or two plain sentences. Deterministic: the same review always gives the same words. */
  text: string
  /** The position the line starts from, and the engine line (UCI) that shows the tactic. */
  fen: string
  line: string[]
  /** Index in `line` of the move that carries the tactic; -1 when it is already on the board. */
  at: number
  /** Squares to highlight, most important first. */
  squares: string[]
}

/** What the explainer needs to know about one move. All of it is in a stored `Review`. */
export interface MoveFacts {
  fenBefore: string
  /** The move played, in UCI. */
  played: string
  label: Label
  /** Engine verdict and line for the position before the move, and for the one after it. */
  before: Eval & { line: readonly string[] }
  after: Eval & { line: readonly string[] }
  /** The opponent's move that led to this position, and what it captured: a reply that takes back is a recapture, not a win. */
  previous?: { uci: string; captured: PieceType | null }
}

/** Material swing, in pawns, a tactic has to be worth before it is named. One pawn for a plain loose pawn. */
const NEED = 2
const NEED_PAWN = 1

const EXPLAINED: ReadonlySet<Label> = new Set(['Mistake', 'Blunder', 'Miss', 'Brilliant', 'Great'])

const named = (p: Placed, withSquare = true) =>
  p.type === 'k' || !withSquare ? `the ${PIECE_NAME[p.type]}` : `the ${PIECE_NAME[p.type]} on ${p.square}`

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function amount(pawns: number): string {
  if (pawns >= 8) return 'a queen'
  if (pawns >= 4.5) return 'a rook'
  if (pawns >= 2.5) return 'a piece'
  if (pawns >= 1.5) return "two pawns' worth"
  return 'a pawn'
}

/** Mate distance for `color`, if the evaluation says it mates. */
function matesIn(e: Eval, color: Color): number | null {
  if (e.mate === null || e.mate === 0) return null
  return e.mate > 0 === (color === 'w') ? Math.abs(e.mate) : null
}

/** A mate delivered on the back rank by a rook or queen, against a king walled in by its own pieces. */
export function isBackRankMate(steps: readonly Step[]): boolean {
  const last = steps[steps.length - 1]
  if (!last?.mate || (last.piece !== 'r' && last.piece !== 'q')) return false
  const b = new Board(last.after)
  const loser = other(last.color)
  const king = b.king(loser)
  if (!king) return false
  const home = loser === 'w' ? '1' : '8'
  const forward = loser === 'w' ? 2 : 7
  if (king[1] !== home || last.to[1] !== home) return false
  const file = king.charCodeAt(0)
  const front = [file - 1, file, file + 1]
    .filter((f) => f >= 97 && f <= 104)
    .map((f) => String.fromCharCode(f) + String(forward))
  const own = front.filter((sq) => b.at(sq)?.color === loser).length
  return own >= 2 && front.every((sq) => b.at(sq)?.color === loser || b.attackers(sq, last.color).length > 0)
}

function sanAt(steps: readonly Step[], i: number): string {
  return steps[i]?.san ?? ''
}

/** The words for a motif, as a phrase that can follow "Allows", "Missed" or stand alone. */
function phrase(m: Motif, steps: readonly Step[]): { noun: string; detail: string } {
  const san = sanAt(steps, m.at)
  const pay = sanAt(steps, m.payoff)
  switch (m.kind) {
    case 'hanging':
      return m.undefended
        ? {
            noun: `the undefended ${PIECE_NAME[m.target.type]} on ${m.target.square}`,
            detail: `${san} wins it`,
          }
        : {
            noun: `${named(m.target)}, which the ${PIECE_NAME[m.by.type]} can take`,
            detail: `${san} wins material`,
          }
    case 'fork':
      return { noun: 'a fork', detail: `${san} attacks ${list(m.targets.map((t) => named(t)))}` }
    case 'pin':
      return m.at < 0
        ? {
            noun: `the pinned ${PIECE_NAME[m.pinned.type]} on ${m.pinned.square}`,
            detail: `it is pinned to ${named(m.behind)}, and ${pay} wins it`,
          }
        : {
            noun: 'a pin',
            detail: `${san} pins ${named(m.pinned)} to ${named(m.behind)}, and ${pay} wins it`,
          }
    case 'skewer':
      return {
        noun: 'a skewer',
        detail: `${san} attacks ${named(m.front)}, and ${named(m.behind)} behind it falls to ${pay}`,
      }
    case 'discoveredAttack':
      return m.check
        ? {
            noun: 'a discovered check',
            detail: `${san} uncovers check from ${named(m.by)}, and ${pay} wins material`,
          }
        : {
            noun: 'a discovered attack',
            detail: `${san} opens the line from ${named(m.by)} to ${named(m.target)}, and ${pay} wins material`,
          }
    case 'trappedPiece':
      return {
        noun: `a trap for ${named(m.target)}`,
        detail: `${san} leaves it no safe square, and ${pay} wins it`,
      }
    case 'overloadedDefender':
      return {
        noun: 'an overloaded defender',
        detail: `${san} ${sanAt(steps, m.at + 1)} pulls ${named(m.defender)} away from ${named(m.target)}, and ${pay} wins it`,
      }
  }
}

function motifSquares(m: Motif): string[] {
  switch (m.kind) {
    case 'hanging':
      return [m.target.square, m.by.square]
    case 'fork':
      return [m.by.square, ...m.targets.map((t) => t.square)]
    case 'pin':
      return [m.pinned.square, m.by.square, m.behind.square]
    case 'skewer':
      return [m.front.square, m.by.square, m.behind.square]
    case 'discoveredAttack':
      return [m.target.square, m.by.square, m.moved.square]
    case 'trappedPiece':
      return [m.target.square]
    case 'overloadedDefender':
      return [m.defender.square, m.pulledTo, m.target.square]
  }
}

function describeMotif(m: Motif, steps: readonly Step[], perspective: Perspective): string {
  const parts = phrase(m, steps)
  const noun = parts.noun
  // A tactic a few moves into the line: say how it comes about.
  const detail =
    m.at > 0 && perspective !== 'played'
      ? `after ${sans(steps.slice(0, m.at))}, ${parts.detail}`
      : parts.detail
  if (perspective === 'allowed') {
    if (m.kind === 'hanging') return `Leaves ${noun}: ${detail}.`
    if (m.kind === 'pin' && m.at < 0) return `Leaves ${noun}: ${detail}.`
    return `Allows ${noun}: ${detail}.`
  }
  if (perspective === 'missed') return `Missed ${noun}: ${detail}.`
  if (m.kind === 'hanging') return `Wins ${noun}.`
  return m.at === 0 ? `${capital(noun)}: ${detail}.` : `Sets up ${noun}: ${detail}.`
}

/** Taking back what the opponent just took, at no more than its worth: an exchange, not a piece won. */
function isRecapture(m: Motif | null, f: MoveFacts): m is Extract<Motif, { kind: 'hanging' }> {
  const prev = f.previous
  return (
    m?.kind === 'hanging' &&
    m.at === 0 &&
    !!prev?.captured &&
    m.target.square === prev.uci.slice(2, 4) &&
    VALUE[m.target.type] <= VALUE[prev.captured]
  )
}

/**
 * The motif that tells the story of a line. A loose piece taken at once is only the story if it
 * accounts for most of the material that changes hands (`total`); otherwise look past it.
 */
function mainMotif(fen: string, steps: readonly Step[], color: Color, total: number): Motif | null {
  const m = findMotif(fen, steps, color)
  if (m?.kind === 'hanging' && VALUE[m.target.type] + 1 < total)
    return findMotif(fen, steps, color, { hanging: false })
  return m
}

/** The material a motif has to be worth before it is named. */
const needFor = (m: Motif | null) => (m?.kind === 'hanging' && m.target.type === 'p' ? NEED_PAWN : NEED)

function explanation(
  kind: TacticKind,
  perspective: Perspective,
  text: string,
  fen: string,
  line: readonly string[],
  at: number,
  squares: string[],
): Explanation {
  return { kind, perspective, text, fen, line: [...line], at, squares }
}

function mateText(n: number, back: boolean): string {
  return `${back ? 'a back-rank mate' : 'a forced mate'} in ${n}`
}

function fromMotif(m: Motif, perspective: Perspective, fen: string, line: readonly string[], steps: Step[]) {
  return explanation(
    m.kind,
    perspective,
    describeMotif(m, steps, perspective),
    fen,
    line,
    m.at,
    motifSquares(m),
  )
}

/**
 * Why a move earned its label, when a tactic in the engine's lines shows it. Returns null when
 * nothing can be said with confidence; the caller then keeps its plain wording.
 *
 * Every claim is checked against the engine's own lines: a motif must appear in them and pay off,
 * and the material it wins must match the difference between the best line and the played one.
 */
export function explainMove(f: MoveFacts): Explanation | null {
  if (!EXPLAINED.has(f.label)) return null
  const mover = turnOf(f.fenBefore)
  const opp = other(mover)
  let fenAfter: string
  try {
    fenAfter = new Chess(f.fenBefore).move({
      from: f.played.slice(0, 2),
      to: f.played.slice(2, 4),
      promotion: f.played[4],
    }).after
  } catch {
    return null
  }
  const playedLine = [f.played, ...f.after.line]
  const best = outcome(f.fenBefore, f.before.line, mover)
  const got = outcome(f.fenBefore, playedLine, mover)
  const bestEarly = early(f.fenBefore, f.before.line, mover)
  const gotEarly = early(f.fenBefore, playedLine, mover, 1)

  if (f.label === 'Great' || f.label === 'Brilliant') return explainGood(f, mover, playedLine, got)

  // Mistakes, blunders and misses.
  const hadMate = matesIn(f.before, mover)
  if (hadMate !== null && matesIn(f.after, mover) === null) {
    const steps = replay(f.fenBefore, f.before.line)
    const back = steps.length > 0 && isBackRankMate(steps)
    return explanation(
      back ? 'backRankMate' : 'mate',
      'missed',
      `Missed ${mateText(hadMate, back)}, starting with ${sanAt(steps, 0)}.`,
      f.fenBefore,
      f.before.line,
      0,
      [f.before.line[0]?.slice(2, 4) ?? ''].filter(Boolean),
    )
  }
  const theirMate = matesIn(f.after, opp)
  if (theirMate !== null && matesIn(f.before, opp) === null) {
    const steps = replay(fenAfter, f.after.line)
    const back = steps.length > 0 && isBackRankMate(steps)
    const last = steps[steps.length - 1]
    const king = last?.mate ? new Board(last.after).king(mover) : null
    return explanation(
      back ? 'backRankMate' : 'mate',
      'allowed',
      `Allows ${mateText(theirMate, back)}, starting with ${sanAt(steps, 0)}.`,
      fenAfter,
      f.after.line,
      0,
      [king ?? '', f.after.line[0]?.slice(2, 4) ?? ''].filter(Boolean),
    )
  }

  const allowed = () => {
    const steps = replay(fenAfter, f.after.line)
    const m = mainMotif(fenAfter, steps, opp, -gotEarly.net)
    // The played move's own capture is part of an exchange, not a piece left hanging, unless the exchange lost material.
    if (
      m?.kind === 'hanging' &&
      m.target.square === f.played.slice(2, 4) &&
      capturedBy(f) &&
      see(f.fenBefore, f.played) >= 0
    )
      return null
    const need = needFor(m)
    if (!m || got > -need || best - got < need) return null
    return fromMotif(m, 'allowed', fenAfter, f.after.line, steps)
  }
  const missed = () => {
    const steps = replay(f.fenBefore, f.before.line)
    const first = findMotif(f.fenBefore, steps, mover)
    const m = isRecapture(first, f) ? first : mainMotif(f.fenBefore, steps, mover, bestEarly.net)
    const need = needFor(m)
    if (!m || best - got < need) return null
    if (isRecapture(m, f)) {
      return explanation(
        'recapture',
        'missed',
        `Missed ${sanAt(steps, 0)}, taking back ${named(m.target)}.`,
        f.fenBefore,
        f.before.line,
        0,
        motifSquares(m),
      )
    }
    if (best < need) return null
    return fromMotif(m, 'missed', f.fenBefore, f.before.line, steps)
  }
  const found = f.label === 'Miss' ? (missed() ?? allowed()) : (allowed() ?? missed())
  if (found) return found

  // No named motif, but material changes hands early in the lines. Only the first few moves count:
  // deeper in a line the engine's moves are less certain, so they are not quoted as fact.
  if (gotEarly.net <= -NEED && bestEarly.net - gotEarly.net >= NEED) {
    const steps = gotEarly.steps.slice(1)
    return explanation(
      'material',
      'allowed',
      `Loses material: after ${sans(steps)}, ${sideName(opp)} has won about ${amount(-gotEarly.net)}.`,
      fenAfter,
      f.after.line,
      0,
      captureSquares(steps),
    )
  }
  if (bestEarly.net >= NEED && bestEarly.net - gotEarly.net >= NEED) {
    const steps = bestEarly.steps
    return explanation(
      'material',
      'missed',
      `Missed a chance to win material: after ${sans(steps)}, ${sideName(mover)} would have won about ${amount(bestEarly.net)}.`,
      f.fenBefore,
      f.before.line,
      0,
      captureSquares(steps),
    )
  }
  return null
}

/** Plies of a line read for a plain material claim. */
const SHORT = 6

/**
 * Material `color` wins in the first SHORT plies of a line (after `skip` plies that are not quoted),
 * counting only captures and promotions actually played. A window that ends on a capture runs on
 * while captures continue, so an exchange is never cut in half. The steps end at the last capture.
 */
function early(fen: string, line: readonly string[], color: Color, skip = 0): { net: number; steps: Step[] } {
  const all = replay(fen, line)
  let k = Math.min(all.length, SHORT + skip)
  while (k < all.length && k < SHORT + skip + 4 && all[k - 1]!.captured) k++
  let net = 0
  let last = -1
  all.slice(0, k).forEach((s, i) => {
    const g = gain(s)
    if (g === 0) return
    net += (s.color === color ? 1 : -1) * g
    last = i
  })
  return { net, steps: all.slice(0, last + 1) }
}

const sans = (steps: readonly Step[]) => steps.map((s) => s.san).join(' ')

const captureSquares = (steps: readonly Step[]) => [
  ...new Set(steps.filter((s) => s.captured || s.promotion).map((s) => s.to)),
]

const capturedBy = (f: MoveFacts) => {
  const b = new Board(f.fenBefore)
  const target = b.at(f.played.slice(2, 4))
  const pawn = b.at(f.played.slice(0, 2))?.type === 'p'
  return !!target || (pawn && f.played[0] !== f.played[2])
}

function explainGood(f: MoveFacts, mover: Color, playedLine: string[], got: number): Explanation | null {
  const steps = replay(f.fenBefore, playedLine)
  const first = steps[0]
  if (!first) return null
  const mate = matesIn(f.after, mover)
  const back = mate !== null && isBackRankMate(steps)
  const motif =
    mate === null ? findMotif(f.fenBefore, steps, mover, { hanging: f.label !== 'Brilliant' }) : null
  if (f.label === 'Great' && isRecapture(motif, f)) {
    return explanation(
      'recapture',
      'played',
      `Takes back ${named(motif.target)}.`,
      f.fenBefore,
      playedLine,
      0,
      motifSquares(motif),
    )
  }
  // Material the opponent just took is owed back; only what this line wins beyond that counts.
  const owed = f.previous?.captured ? VALUE[f.previous.captured] : 0
  const usable = motif && got - owed >= needFor(motif) ? motif : null
  const won = early(f.fenBefore, playedLine, mover)
  const net = won.net - owed

  if (f.label === 'Brilliant') {
    const piece: PieceType = first.promotion ?? first.piece
    const lead = `Sacrifices the ${PIECE_NAME[piece]}.`
    if (mate !== null) {
      return explanation(
        back ? 'backRankMate' : 'mate',
        'played',
        `${lead} ${sideName(mover)} now has ${mateText(mate, back)}.`,
        f.fenBefore,
        playedLine,
        0,
        [first.to],
      )
    }
    if (usable) {
      const { noun, detail } = phrase(usable, steps)
      const text = `${lead} ${usable.at === 0 ? 'It is also' : 'It sets up'} ${noun}: ${detail}.`
      return explanation('sacrifice', 'played', text, f.fenBefore, playedLine, usable.at, [
        first.to,
        ...motifSquares(usable),
      ])
    }
    if (net >= NEED) {
      return explanation(
        'sacrifice',
        'played',
        `${lead} It wins back more than it gives: after ${sans(won.steps)}, ${sideName(mover)} is about ${amount(net)} up.`,
        f.fenBefore,
        playedLine,
        0,
        [first.to],
      )
    }
    return null
  }

  // Great: the only good move.
  if (mate !== null) {
    return explanation(
      back ? 'backRankMate' : 'mate',
      'played',
      `Starts ${mateText(mate, back)}.`,
      f.fenBefore,
      playedLine,
      0,
      [first.to],
    )
  }
  if (usable) return fromMotif(usable, 'played', f.fenBefore, playedLine, steps)
  if (first.promotion) {
    return explanation(
      'material',
      'played',
      `Promotes to a ${PIECE_NAME[first.promotion]}.`,
      f.fenBefore,
      playedLine,
      0,
      [first.to],
    )
  }
  if (net >= NEED) {
    return explanation(
      'material',
      'played',
      `Wins material: after ${sans(won.steps)}, ${sideName(mover)} is about ${amount(net)} up.`,
      f.fenBefore,
      playedLine,
      0,
      captureSquares(won.steps),
    )
  }
  return null
}

/** The explanation for move `i` (0-based) of a stored review. */
export function explainReviewMove(review: Review, i: number): Explanation | null {
  const m = review.moves[i]
  const before = review.evals[i]
  const after = review.evals[i + 1]
  if (!m || !before || !after) return null
  const prev = review.moves[i - 1]
  const taken = prev ? new Board(review.fens[i - 1]!).at(prev.uci.slice(2, 4)) : null
  const enPassant = prev && !taken && prev.san.includes('x')
  return explainMove({
    previous: prev && { uci: prev.uci, captured: taken?.type ?? (enPassant ? 'p' : null) },
    fenBefore: review.fens[i]!,
    played: m.uci,
    label: m.label,
    before: { ...before, line: review.lines[i] ?? [] },
    after: { ...after, line: review.lines[i + 1] ?? [] },
  })
}
