import {
  AnalysisAborted,
  answer,
  dedupeByPosition,
  explainReviewMove,
  freshProgress,
  isoDate,
  positionKey,
  puzzleCandidates,
  puzzleTactic,
  sideOf,
  verifyPuzzle,
  type Engine,
  type PuzzleCandidate,
  type PuzzlePerspective,
  type PuzzleLimits,
  type PuzzleRecord,
} from '@chessreview/core'
import type { ReviewStore } from './storage'

/** How hard each candidate is searched to prove its best move is the only good one. */
export const PUZZLE_LIMITS: PuzzleLimits = { depth: 18, nodes: 3_000_000 }
/** Results are saved this often, so closing the tab midway keeps what was done. */
const SAVE_EVERY = 4

/** A puzzle with a tactic whose side was not kept when it was made. */
const needsSide = (r: PuzzleRecord) => r.tactic !== null && r.perspective === undefined

export interface PuzzleDeps {
  store: ReviewStore
  /** Runs `work` with the engine pool. */
  engine: <T>(work: (engine: Engine) => Promise<T>) => Promise<T>
  now?: () => number
  limits?: PuzzleLimits
}

export interface SyncProgress {
  done: number
  total: number
}

/** Makes puzzles from the stored reviews of one player, and keeps how they were answered. */
export class PuzzleService {
  constructor(private deps: PuzzleDeps) {}

  private get limits() {
    return this.deps.limits ?? PUZZLE_LIMITS
  }

  private now() {
    return (this.deps.now ?? Date.now)()
  }

  private async all(player: string): Promise<PuzzleRecord[]> {
    const mine = player.toLowerCase()
    return (await this.deps.store.allPuzzles()).filter((r) => r.player === mine)
  }

  async list(player: string): Promise<PuzzleRecord[]> {
    const records = await this.all(player)
    const todo = records.filter(needsSide)
    if (todo.length === 0) return records
    try {
      await this.backfill(todo)
    } catch (e) {
      // Only the focus on a side is affected, so the puzzles still load.
      console.warn('Could not work out which side of its tactic each puzzle was on', e)
      return records
    }
    return this.all(player)
  }

  /**
   * Puzzles made before the side of the tactic was kept get it from their game's review. When the review
   * is gone the side stays unset, so it can be worked out if the game is reviewed again; when the review no
   * longer shows that tactic, it is recorded as unknown so this is not tried again. A game whose review
   * cannot be read is skipped and the rest are still filled in.
   */
  private async backfill(todo: readonly PuzzleRecord[]): Promise<void> {
    const sides = new Map<string, PuzzlePerspective | null>()
    const byGame = new Map<string, PuzzleRecord[]>()
    for (const r of todo) {
      if (!r.puzzle) {
        sides.set(r.id, null) // its position was not kept as a puzzle, so there is nothing to look up
        continue
      }
      byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r])
    }
    // One game at a time in parallel, each review dropped as soon as its puzzles are done.
    await Promise.all(
      [...byGame].map(async ([gameId, records]) => {
        try {
          const stored = await this.deps.store.getReview(gameId)
          if (!stored) return
          for (const r of records) {
            const found = puzzleTactic(explainReviewMove(stored.review, r.puzzle!.moveIndex))
            sides.set(r.id, found.tactic === r.tactic ? found.perspective : null)
          }
        } catch (e) {
          console.warn(`Could not work out the side of the puzzles from game ${gameId}`, e)
        }
      }),
    )
    // Written onto the records as they are now, so an answer given while the reviews were read is kept.
    const current = (await this.deps.store.allPuzzles()).filter((r) => needsSide(r) && sides.has(r.id))
    if (current.length > 0)
      await this.deps.store.putPuzzles(current.map((r) => ({ ...r, perspective: sides.get(r.id) ?? null })))
  }

  /** Mistakes in the player's reviewed games that have not been checked yet. */
  async pending(player: string): Promise<{ record: PuzzleRecord; candidate: PuzzleCandidate }[]> {
    const mine = player.toLowerCase()
    const known = new Set((await this.all(player)).map((r) => r.id))
    const found: {
      candidate: PuzzleCandidate
      gameId: string
      opponent: string
      date: string | null
      tactic: string | null
      perspective: PuzzleRecord['perspective']
    }[] = []
    for (const s of await this.deps.store.allReviews()) {
      const side = sideOf(s.review, player)
      if (!side) continue
      for (const candidate of puzzleCandidates(s.review, side)) {
        const e = explainReviewMove(s.review, candidate.moveIndex)
        found.push({
          candidate,
          gameId: s.id,
          opponent: side === 'white' ? s.review.black : s.review.white,
          date: isoDate(s.review.headers),
          ...puzzleTactic(e),
        })
      }
    }
    return dedupeByPosition(found.map((f) => ({ ...f, fen: f.candidate.fen })))
      .map((f) => ({
        candidate: f.candidate,
        record: {
          id: `${mine}|${positionKey(f.fen)}`,
          player: mine,
          gameId: f.gameId,
          opponent: f.opponent,
          date: f.date,
          tactic: f.tactic,
          perspective: f.perspective,
          checkedWith: this.limits,
          puzzle: null,
          progress: freshProgress(),
        } satisfies PuzzleRecord,
      }))
      .filter((p) => !known.has(p.record.id))
  }

  /**
   * Checks every new mistake of the player and saves the result, puzzle or not, so a position is
   * searched once. Stops quietly when cancelled, keeping what is done.
   */
  async sync(
    player: string,
    onProgress: (p: SyncProgress) => void = () => undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    const todo = await this.pending(player)
    const total = todo.length
    if (total === 0) return
    let done = 0
    let unsaved: PuzzleRecord[] = []
    const flush = async () => {
      const batch = unsaved
      unsaved = []
      if (batch.length > 0) await this.deps.store.putPuzzles(batch)
    }
    onProgress({ done, total })
    try {
      await this.deps.engine((engine) =>
        Promise.all(
          todo.map(async ({ record, candidate }) => {
            if (signal?.aborted) return
            let puzzle
            try {
              puzzle = await verifyPuzzle(candidate, engine, this.limits, signal)
            } catch (e) {
              if (e instanceof AnalysisAborted || signal?.aborted) return
              throw e
            }
            unsaved.push({ ...record, puzzle })
            onProgress({ done: ++done, total })
            if (unsaved.length >= SAVE_EVERY) await flush()
          }),
        ),
      )
    } finally {
      await flush()
    }
  }

  /** Records an answer and returns the updated record. */
  async answer(record: PuzzleRecord, correct: boolean): Promise<PuzzleRecord> {
    const next = { ...record, progress: answer(record.progress, correct, this.now()) }
    await this.deps.store.putPuzzles([next])
    return next
  }
}
