import { ERROR_LABELS } from './labels'
import { PHASES, type Counts, type Label, type Phase, type Review, type Side } from './types'

/**
 * Statistics across many reviews of one player's games. Pure: given the same reviews and the same
 * tactic tags, the same numbers come out, and nothing leaves the device.
 */

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'unknown'
export const TIME_CLASSES: readonly TimeClass[] = [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'daily',
  'unknown',
]

/** The tactic behind an error, as `explainReviewMove` names it (kind and perspective). */
export interface TacticTag {
  kind: string
  perspective: 'allowed' | 'missed' | 'played'
}

/** What one game contributes, from the player's side. */
export interface GameFacts {
  id: string
  /** ISO date (YYYY-MM-DD) when the PGN has one. */
  date: string | null
  /** When it was reviewed (ms), to order games without a date. */
  reviewedAt: number
  side: Side
  opponent: string
  result: 'win' | 'loss' | 'draw' | null
  accuracy: number
  timeClass: TimeClass
  opening: string
  eco: string
  /** The player's moves and labels in each phase. */
  phases: Record<Phase, { moves: number; counts: Counts }>
  /** Tags of the player's mistakes, misses and blunders that have one. */
  tactics: TacticTag[]
}

/** The class of a PGN TimeControl, by the usual rule: base time plus 40 increments. */
export function timeClass(tc: string | undefined): TimeClass {
  if (!tc || tc === '-' || tc === '?') return 'unknown'
  if (tc.includes('/')) return 'daily'
  const [base, inc = '0'] = tc.split('+')
  const seconds = Number(base) + 40 * Number(inc)
  if (!Number.isFinite(seconds)) return 'unknown'
  if (seconds < 180) return 'bullet'
  if (seconds < 480) return 'blitz'
  if (seconds < 1500) return 'rapid'
  return 'classical'
}

/** YYYY-MM-DD from a PGN date ("2024.03.07"), or null when it is missing or partial. */
export function isoDate(h: Record<string, string>): string | null {
  const raw = h.UTCDate ?? h.Date ?? h.EndDate ?? ''
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})$/.exec(raw)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The player's side in a game, if they played it. */
export function sideOf(review: Review, player: string): Side | null {
  if (same(review.white, player)) return 'white'
  if (same(review.black, player)) return 'black'
  return null
}

/** One game seen from the player's side; null if they did not play in it. */
export function gameFacts(
  id: string,
  review: Review,
  player: string,
  reviewedAt: number,
  tagOf: (moveIndex: number) => TacticTag | null = () => null,
): GameFacts | null {
  const side = sideOf(review, player)
  if (!side) return null
  const color = side === 'white' ? 'w' : 'b'
  const won = side === 'white' ? '1-0' : '0-1'
  const lost = side === 'white' ? '0-1' : '1-0'
  const result =
    review.result === won
      ? 'win'
      : review.result === lost
        ? 'loss'
        : review.result === '1/2-1/2'
          ? 'draw'
          : null
  const phases = Object.fromEntries(PHASES.map((p) => [p, { moves: 0, counts: {} }])) as GameFacts['phases']
  const tactics: TacticTag[] = []
  review.moves.forEach((m, i) => {
    if (m.color !== color) return
    const ph = phases[m.phase]
    ph.moves++
    ph.counts[m.label] = (ph.counts[m.label] ?? 0) + 1
    if (m.label === 'Mistake' || m.label === 'Blunder' || m.label === 'Miss') {
      const tag = tagOf(i)
      if (tag) tactics.push(tag)
    }
  })
  return {
    id,
    date: isoDate(review.headers),
    reviewedAt,
    side,
    opponent: side === 'white' ? review.black : review.white,
    result,
    accuracy: review.accuracy[side],
    timeClass: timeClass(review.headers.TimeControl),
    opening: review.opening.split(':')[0]?.trim() || 'Unknown opening',
    eco: review.eco,
    phases,
    tactics,
  }
}

export interface Tally {
  games: number
  wins: number
  draws: number
  losses: number
  /** Points per game from the results known, 0–100; null when no result is known. */
  score: number | null
  accuracy: number
}

export interface Insights {
  games: number
  /** Oldest first. */
  trend: Array<{ id: string; date: string | null; accuracy: number; opponent: string }>
  accuracy: number
  /** Accuracy over the most recent games (up to 10). */
  recentAccuracy: number
  /** Error labels per 100 of the player's moves, by phase. */
  phases: Record<Phase, { moves: number; per100: Partial<Record<Label, number>> }>
  /** The player's most frequent tactical errors, most frequent first. */
  tactics: Array<TacticTag & { count: number }>
  /** How many of the player's errors had a tactic named at all. */
  tagged: { errors: number; withTactic: number }
  openings: Array<{ opening: string; eco: string } & Tally>
  timeClasses: Array<{ timeClass: TimeClass } & Tally>
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function tally(games: GameFacts[]): Tally {
  const wins = games.filter((g) => g.result === 'win').length
  const draws = games.filter((g) => g.result === 'draw').length
  const losses = games.filter((g) => g.result === 'loss').length
  const known = wins + draws + losses
  return {
    games: games.length,
    wins,
    draws,
    losses,
    score: known ? ((wins + draws / 2) / known) * 100 : null,
    accuracy: mean(games.map((g) => g.accuracy)),
  }
}

function groupBy<K extends string>(games: GameFacts[], key: (g: GameFacts) => K): Map<K, GameFacts[]> {
  const out = new Map<K, GameFacts[]>()
  for (const g of games) out.set(key(g), [...(out.get(key(g)) ?? []), g])
  return out
}

/** Orders games oldest first: by date where known, then by when they were reviewed. */
export function chronological(games: readonly GameFacts[]): GameFacts[] {
  return [...games].sort(
    (a, b) =>
      (a.date ?? '').localeCompare(b.date ?? '') || a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id),
  )
}

export function insights(facts: readonly GameFacts[]): Insights {
  const games = chronological(facts)
  const phases = Object.fromEntries(
    PHASES.map((p) => {
      const moves = games.reduce((n, g) => n + g.phases[p].moves, 0)
      const per100: Partial<Record<Label, number>> = {}
      for (const l of ERROR_LABELS) {
        const n = games.reduce((t, g) => t + (g.phases[p].counts[l] ?? 0), 0)
        per100[l] = moves ? (100 * n) / moves : 0
      }
      return [p, { moves, per100 }]
    }),
  ) as Insights['phases']

  const tagCounts = new Map<string, TacticTag & { count: number }>()
  for (const t of games.flatMap((g) => g.tactics)) {
    const key = `${t.kind}/${t.perspective}`
    const hit = tagCounts.get(key) ?? { ...t, count: 0 }
    hit.count++
    tagCounts.set(key, hit)
  }
  const errors = games.reduce(
    (n, g) =>
      n +
      PHASES.reduce(
        (m, p) =>
          m + (['Mistake', 'Blunder', 'Miss'] as const).reduce((k, l) => k + (g.phases[p].counts[l] ?? 0), 0),
        0,
      ),
    0,
  )

  const openings = [...groupBy(games, (g) => g.opening)]
    .map(([opening, gs]) => ({ opening, eco: gs[gs.length - 1]!.eco, ...tally(gs) }))
    .sort((a, b) => b.games - a.games || a.opening.localeCompare(b.opening))
  const byClass = groupBy(games, (g) => g.timeClass)

  return {
    games: games.length,
    trend: games.map((g) => ({ id: g.id, date: g.date, accuracy: g.accuracy, opponent: g.opponent })),
    accuracy: mean(games.map((g) => g.accuracy)),
    recentAccuracy: mean(games.slice(-10).map((g) => g.accuracy)),
    phases,
    tactics: [...tagCounts.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    tagged: { errors, withTactic: games.reduce((n, g) => n + g.tactics.length, 0) },
    openings,
    timeClasses: TIME_CLASSES.filter((c) => byClass.has(c)).map((c) => ({
      timeClass: c,
      ...tally(byClass.get(c)!),
    })),
  }
}

/** The players in a set of reviews, most games first, for choosing whose insights to show. */
export function playersIn(reviews: readonly Review[]): Array<{ name: string; games: number }> {
  const count = new Map<string, { name: string; games: number }>()
  for (const r of reviews) {
    for (const name of [r.white, r.black]) {
      if (!name || name === '?') continue
      const key = name.toLowerCase()
      const hit = count.get(key) ?? { name, games: 0 }
      hit.games++
      count.set(key, hit)
    }
  }
  return [...count.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
}
