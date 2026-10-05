import { Chess } from 'chess.js'
import type { Color } from '../types'
import { Board, VALUE, other, slides, staticExchange, type PieceType } from './board'
import type { Step } from './line'

/** A piece on a square. */
export interface Placed {
  type: PieceType
  square: string
}

/**
 * A tactic found in an engine line. `at` is the step that creates it (-1: it is already there in
 * the starting position) and `payoff` the step that cashes it in. Every motif must be confirmed by
 * a payoff: a later capture in the same line that wins material by static exchange. A pattern the
 * engine's own line does not exploit is never reported.
 */
export type Motif =
  | { kind: 'hanging'; at: number; payoff: number; target: Placed; by: Placed; undefended: boolean }
  | { kind: 'fork'; at: number; payoff: number; by: Placed; targets: Placed[] }
  | { kind: 'pin'; at: number; payoff: number; by: Placed; pinned: Placed; behind: Placed }
  | { kind: 'skewer'; at: number; payoff: number; by: Placed; front: Placed; behind: Placed }
  | {
      kind: 'discoveredAttack'
      at: number
      payoff: number
      by: Placed
      moved: Placed
      target: Placed
      check: boolean
    }
  | { kind: 'trappedPiece'; at: number; payoff: number; target: Placed }
  | {
      kind: 'overloadedDefender'
      at: number
      payoff: number
      defender: Placed
      /** The square the defender was pulled to, and the piece it stopped guarding. */
      pulledTo: string
      target: Placed
    }

export type MotifKind = Motif['kind']

/** How many of the attacking side's moves to look through for the start of a tactic. */
const START_WITHIN = 3
/** How many of its moves after that the payoff may take. */
const PAYOFF_WITHIN = 2

const safeSee = (fen: string, uci: string): number => staticExchange(fen, uci.slice(0, 2), uci.slice(2, 4))

/** A capture by `color` that wins material by static exchange. */
const winsMaterial = (s: Step | undefined, color: Color): s is Step =>
  !!s && s.color === color && s.captured !== null && safeSee(s.before, s.uci) > 0

/** Indices of `color`'s moves after `k`, within PAYOFF_WITHIN of them. */
function payoffSteps(steps: readonly Step[], k: number, color: Color): number[] {
  const out: number[] = []
  for (let j = k + 1; j < steps.length && out.length < PAYOFF_WITHIN; j++) {
    if (steps[j]!.color === color) out.push(j)
  }
  return out
}

/** The same position with the other side to move (en passant cleared), for "what if it were their turn". */
function passTurn(fen: string): string {
  const f = fen.split(' ')
  f[1] = f[1] === 'w' ? 'b' : 'w'
  f[3] = '-'
  return f.join(' ')
}

/** The most `color` wins by capturing on `sq` when it is its turn; 0 if no capture there wins anything. */
function threatOn(fen: string, sq: string, color: Color): number {
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w'
  const pos = turn === color ? fen : passTurn(fen)
  // Only pieces whose line of fire reaches the square can capture there: generate just their moves.
  const hitters = new Board(pos).attackers(sq, color)
  if (hitters.length === 0) return 0
  let chess: Chess
  try {
    chess = new Chess(pos)
  } catch {
    return 0
  }
  let best = 0
  for (const from of hitters) {
    for (const m of chess.moves({ square: from as never, verbose: true })) {
      if (m.to === sq && m.captured) best = Math.max(best, safeSee(pos, m.from + m.to))
    }
  }
  return best
}

/** Order for listing targets: the king first, then by value. */
const rank = (t: PieceType) => (t === 'k' ? 100 : VALUE[t])

const defended = (b: Board, sq: string, color: Color) => b.attackers(sq, color).length > 0

/** Is the piece on `sq` worth attacking for a piece of value `by`: the king, something bigger, or something loose. */
function worthAttacking(b: Board, sq: string, byType: PieceType): boolean {
  const p = b.at(sq)
  if (!p) return false
  return p.type === 'k' || VALUE[p.type] > VALUE[byType] || !defended(b, sq, p.color)
}

/** Takes a piece that has no defender, or one worth more than the piece that takes it. */
export function hanging(steps: readonly Step[], k: number): Motif | null {
  const s = steps[k]
  if (!s || !s.captured || !winsMaterial(s, s.color)) return null
  const before = new Board(s.before)
  const victim = other(s.color)
  const undefended = !defended(before, s.to, victim)
  if (!undefended && VALUE[s.piece] >= VALUE[s.captured]) return null
  return {
    kind: 'hanging',
    at: k,
    payoff: k,
    target: { type: s.captured, square: s.to },
    by: { type: s.piece, square: s.from },
    undefended,
  }
}

/** One piece lands where it attacks two targets at once, and a later capture takes one of them. */
export function fork(steps: readonly Step[], k: number): Motif | null {
  const s = steps[k]
  if (!s) return null
  const a = s.color
  const v = other(a)
  const before = new Board(s.before)
  const after = new Board(s.after)
  const forker = after.at(s.to)
  if (!forker) return null
  // A target was already lost before this move if something cheaper attacked it, or it was loose and attacked.
  const alreadyLost = (sq: string) => {
    const p = before.at(sq)
    if (!p) return false
    const hitters = before.attackers(sq, a)
    return (
      hitters.some((h) => VALUE[before.at(h)!.type] < VALUE[p.type]) ||
      (hitters.length > 0 && !defended(before, sq, v))
    )
  }
  const targets: Placed[] = after
    .attacks(s.to)
    .filter((sq) => {
      const p = after.at(sq)
      return (
        !!p &&
        p.color === v &&
        (p.type === 'k' || VALUE[p.type] >= 3) &&
        worthAttacking(after, sq, forker.type) &&
        !(p.type !== 'k' && alreadyLost(sq))
      )
    })
    .map((sq) => ({ type: after.at(sq)!.type, square: sq }))
    .sort((x, y) => rank(y.type) - rank(x.type))
  if (targets.length < 2) return null
  for (const j of payoffSteps(steps, k, a)) {
    const p = steps[j]!
    const hit = targets.find(
      (t) => t.type !== 'k' && t.square === p.to && new Board(p.before).at(p.to)?.type === t.type,
    )
    if (hit && winsMaterial(p, a))
      return { kind: 'fork', at: k, payoff: j, by: { type: forker.type, square: s.to }, targets }
  }
  return null
}

interface Line {
  by: Placed
  near: Placed
  far: Placed
}

/** Every line from a long-range piece of `color` through an enemy piece to a second enemy piece behind it. */
function xrays(b: Board, color: Color): Line[] {
  const out: Line[] = []
  for (const sq of b.pieces(color)) {
    const p = b.at(sq)!
    for (const d of slides(p.type)) {
      const [near, far] = b.ray(sq, d)
      if (!near || !far || near.piece.color === color || far.piece.color === color) continue
      out.push({
        by: { type: p.type, square: sq },
        near: { type: near.piece.type, square: near.square },
        far: { type: far.piece.type, square: far.square },
      })
    }
  }
  return out
}

/** A piece that cannot move without exposing something worth more behind it. */
function pinsIn(fen: string, color: Color): Line[] {
  const b = new Board(fen)
  const victim = other(color)
  const theirs = b.turn === victim ? fen : passTurn(fen)
  return xrays(b, color).filter(
    (l) =>
      l.near.type !== 'k' &&
      l.near.type !== 'p' &&
      (l.far.type === 'k' || VALUE[l.far.type] > VALUE[l.near.type]) &&
      // A pinned piece that can safely take the pinner is not pinned in any useful sense.
      !(b.attacks(l.near.square).includes(l.by.square) && safeSee(theirs, l.near.square + l.by.square) >= 0),
  )
}

const sameLine = (x: Line, y: Line) =>
  x.by.square === y.by.square && x.near.square === y.near.square && x.far.square === y.far.square

/**
 * A pin `color` holds after step `k` (or in the starting position, k = -1) that it then cashes in
 * by winning the pinned piece, with the pin still in place when it does.
 */
export function pin(steps: readonly Step[], k: number, color: Color, startFen: string): Motif | null {
  const fen = k < 0 ? startFen : steps[k]?.after
  if (!fen || (k >= 0 && steps[k]!.color !== color)) return null
  const prior = k < 0 ? [] : pinsIn(steps[k]!.before, color)
  for (const l of pinsIn(fen, color)) {
    if (prior.some((p) => sameLine(p, l))) continue
    for (const j of payoffSteps(steps, k, color)) {
      const p = steps[j]!
      if (!winsMaterial(p, color)) continue
      const found = { kind: 'pin' as const, at: k, payoff: j, by: l.by, pinned: l.near, behind: l.far }
      // The pinned piece took the pinner, its only way out, and is taken in turn.
      const reply = steps[j - 1]
      if (
        reply &&
        reply.color !== color &&
        reply.from === l.near.square &&
        reply.to === l.by.square &&
        p.to === l.by.square
      )
        return found
      // Something collects it while it is still pinned. The pinner itself only counts when the pinned
      // piece is worth more than it: taking an equal or lesser piece it attacks is just a capture.
      if (p.to !== l.near.square) continue
      if (p.from === l.by.square && VALUE[l.near.type] <= VALUE[l.by.type]) continue
      if (pinsIn(p.before, color).some((q) => sameLine(q, l))) return found
    }
  }
  return null
}

/** A long-range move attacks a valuable piece with a lesser one behind it; the front one moves and the back one falls. */
export function skewer(steps: readonly Step[], k: number): Motif | null {
  const s = steps[k]
  if (!s) return null
  const a = s.color
  const after = new Board(s.after)
  const piece = after.at(s.to)
  if (!piece || slides(piece.type).length === 0) return null
  for (const l of xrays(after, a)) {
    if (l.by.square !== s.to || l.far.type === 'k') continue
    if (!(l.near.type === 'k' || VALUE[l.near.type] > VALUE[l.far.type])) continue
    if (!worthAttacking(after, l.near.square, piece.type)) continue
    for (const j of payoffSteps(steps, k, a)) {
      const p = steps[j]!
      if (p.from === s.to && p.to === l.far.square && winsMaterial(p, a)) {
        return { kind: 'skewer', at: k, payoff: j, by: l.by, front: l.near, behind: l.far }
      }
    }
  }
  return null
}

/** A piece moves out of the way of a long-range piece, which now attacks something, while the moved piece makes a threat of its own. */
export function discovered(steps: readonly Step[], k: number): Motif | null {
  const s = steps[k]
  if (!s || s.san.startsWith('O-O')) return null
  const a = s.color
  const v = other(a)
  const before = new Board(s.before)
  const after = new Board(s.after)
  const moved = after.at(s.to)
  if (!moved) return null
  for (const sq of after.pieces(a)) {
    if (sq === s.to) continue
    const slider = after.at(sq)!
    for (const d of slides(slider.type)) {
      if (before.ray(sq, d)[0]?.square !== s.from) continue
      const t = after.ray(sq, d)[0]
      if (!t || t.piece.color !== v || t.piece.type === 'p' || !worthAttacking(after, t.square, slider.type))
        continue
      const check = t.piece.type === 'k'
      // The moved piece must threaten something too, or this is just an attack, not a discovered one.
      const ownThreat =
        s.check ||
        s.captured !== null ||
        after
          .attacks(s.to)
          .some((x) => x !== t.square && after.at(x)?.color === v && worthAttacking(after, x, moved.type))
      if (!ownThreat) continue
      for (const j of payoffSteps(steps, k, a)) {
        const p = steps[j]!
        // Cashed in by the uncovered piece taking its target, by the moved piece, or (after a check) by either.
        const cashes = (p.from === sq && (check || p.to === t.square)) || p.from === s.to
        if (cashes && winsMaterial(p, a)) {
          return {
            kind: 'discoveredAttack',
            at: k,
            payoff: j,
            by: { type: slider.type, square: sq },
            moved: { type: moved.type, square: s.to },
            target: { type: t.piece.type, square: t.square },
            check,
          }
        }
      }
    }
  }
  return null
}

/** After step `k`, an enemy piece is attacked, has no safe square to go to, and is later won. */
export function trapped(steps: readonly Step[], k: number): Motif | null {
  const s = steps[k]
  if (!s || s.check) return null // a check forces the reply; that is not a trap
  const a = s.color
  const v = other(a)
  // Only a piece the line goes on to win can have been trapped: look at nothing else.
  const won = new Set(payoffSteps(steps, k, a).flatMap((j) => steps[j]!.captured ?? []))
  if (![...won].some((t) => t !== 'p')) return null
  const after = new Board(s.after)
  let chess: Chess
  try {
    chess = new Chess(s.after)
  } catch {
    return null
  }
  const pinned = new Set(pinsIn(s.after, a).map((l) => l.near.square))
  for (const sq of after.pieces(v)) {
    const piece = after.at(sq)!
    // A pinned piece that cannot get away is the pin's doing; the pin detector names it.
    if (!won.has(piece.type) || piece.type === 'k' || pinned.has(sq)) continue
    if (threatOn(s.after, sq, a) <= 0 || threatOn(s.before, sq, a) > 0) continue // must be newly threatened
    const exits = chess.moves({ square: sq as never, verbose: true })
    const safe = exits.some((m) => {
      const taken = m.captured ? VALUE[m.captured] : 0
      return threatOn(m.after, m.to, a) <= taken
    })
    if (safe) continue
    const places = new Set([sq, ...exits.map((m) => m.to)])
    for (const j of payoffSteps(steps, k, a)) {
      const p = steps[j]!
      if (p.captured === piece.type && places.has(p.to) && winsMaterial(p, a)) {
        return { kind: 'trappedPiece', at: k, payoff: j, target: { type: piece.type, square: sq } }
      }
    }
  }
  return null
}

/**
 * A capture forces a defender to recapture, and in doing so it stops guarding a second piece,
 * which the next move wins. The second capture must not have worked while the defender was in place.
 */
export function overloaded(steps: readonly Step[], k: number): Motif | null {
  const [s1, s2, s3] = [steps[k], steps[k + 1], steps[k + 2]]
  if (!s1 || !s2 || !s3 || !s1.captured || !s2.captured || s2.to !== s1.to) return null
  const a = s1.color
  if (s3.to === s1.to || !winsMaterial(s3, a)) return null
  const mid = new Board(s1.after)
  if (!mid.attacks(s2.from).includes(s3.to) || mid.at(s3.to)?.color !== other(a)) return null
  if (new Board(s2.after).attacks(s2.to).includes(s3.to)) return null // still guards it from the new square
  // With the defender still at home, the same capture would not have won anything.
  if (safeSee(passTurn(s1.after), s3.uci) > 0) return null
  return {
    kind: 'overloadedDefender',
    at: k,
    payoff: k + 2,
    defender: { type: s2.piece, square: s2.from },
    pulledTo: s2.to,
    target: { type: mid.at(s3.to)!.type, square: s3.to },
  }
}

/**
 * The first tactic `color` plays in a line, looking through its first few moves. In order of how
 * plainly it explains the line: a piece taken for free, then the classic motifs.
 */
export function findMotif(
  startFen: string,
  steps: readonly Step[],
  color: Color,
  opts: { hanging?: boolean } = {},
): Motif | null {
  const mine = steps.flatMap((s, i) => (s.color === color ? [i] : [])).slice(0, START_WITHIN)
  if (opts.hanging !== false && mine[0] === 0) {
    const h = hanging(steps, 0)
    if (h) return h
  }
  const existing = pin(steps, -1, color, startFen)
  if (existing) return existing
  for (const k of mine) {
    const found =
      fork(steps, k) ??
      skewer(steps, k) ??
      discovered(steps, k) ??
      pin(steps, k, color, startFen) ??
      trapped(steps, k) ??
      overloaded(steps, k)
    if (found) return found
  }
  return null
}
