import { AnalysisAborted, explainReviewMove, gameFacts, type GameFacts } from '@chessreview/core'
import type { StoredReview } from './services'

// Facts per review and player, kept for the session: explaining every error is the slow part.
const cache = new Map<string, GameFacts | null>()

/**
 * The player's side of every stored game they played, with their errors tagged by the tactic behind
 * them. Explaining errors takes milliseconds each, so the work yields to the page every 20 ms and
 * reports progress; it can be cancelled.
 */
export async function factsFor(
  stored: readonly StoredReview[],
  player: string,
  onProgress: (done: number, total: number) => void = () => undefined,
  signal?: AbortSignal,
): Promise<GameFacts[]> {
  const out: GameFacts[] = []
  let slice = performance.now()
  for (const [i, s] of stored.entries()) {
    if (signal?.aborted) throw new AnalysisAborted()
    const key = `${s.id}|${player.toLowerCase()}`
    if (!cache.has(key)) {
      cache.set(
        key,
        gameFacts(s.id, s.review, player, s.createdAt, (m) => {
          const e = explainReviewMove(s.review, m)
          return e && e.perspective !== 'played' ? { kind: e.kind, perspective: e.perspective } : null
        }),
      )
    }
    const facts = cache.get(key)
    if (facts) out.push(facts)
    if (performance.now() - slice > 20) {
      onProgress(i + 1, stored.length)
      await new Promise((r) => setTimeout(r, 0))
      slice = performance.now()
    }
  }
  return out
}

/** Words for a tactic tag, as a row label: what happened to the player. */
export function tacticName(kind: string, perspective: 'allowed' | 'missed' | 'played'): string {
  const allowed: Record<string, string> = {
    hanging: 'Left a piece hanging',
    fork: 'Allowed a fork',
    pin: 'Allowed a pin',
    skewer: 'Allowed a skewer',
    discoveredAttack: 'Allowed a discovered attack',
    trappedPiece: 'Let a piece get trapped',
    overloadedDefender: 'Left a defender overloaded',
    mate: 'Allowed a forced mate',
    backRankMate: 'Allowed a back-rank mate',
    material: 'Lost material',
  }
  const missed: Record<string, string> = {
    hanging: 'Missed a free piece',
    fork: 'Missed a fork',
    pin: 'Missed a pin',
    skewer: 'Missed a skewer',
    discoveredAttack: 'Missed a discovered attack',
    trappedPiece: 'Missed trapping a piece',
    overloadedDefender: 'Missed an overloaded defender',
    mate: 'Missed a forced mate',
    backRankMate: 'Missed a back-rank mate',
    material: 'Missed winning material',
    recapture: 'Missed a recapture',
  }
  const table = perspective === 'missed' ? missed : allowed
  return table[kind] ?? `${perspective === 'missed' ? 'Missed' : 'Allowed'}: ${kind}`
}
