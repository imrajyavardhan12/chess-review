import {
  AnalysisAborted,
  InvalidPgnError,
  buildReview,
  evaluatePositions,
  parseGame,
  reviewKey,
  settingsFor,
  type OpeningBook,
  type PresetName,
  type Review,
} from '@chessreview/core'
import { EngineError } from '@chessreview/engine'
import { EngineNotInstalled } from './full-engine'
import type { EngineHost } from './engine-host'
import { summarize, type ReviewStore } from './storage'

export type JobState =
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; review: Review }
  | { status: 'error'; message: string }
  /** Nothing stored and nothing to resume: e.g. a link opened on another device. */
  | { status: 'missing' }

interface Job {
  state: JobState
  listeners: Set<(s: JobState) => void>
  controller: AbortController
}

export interface ReviewServiceDeps {
  store: ReviewStore
  /** The engine pool for an engine build. May refuse, e.g. for an engine that is not downloaded. */
  engine: (engineId: string) => Promise<EngineHost>
  loadBook: () => Promise<OpeningBook>
  /** The engine build used unless another is asked for; part of every review's id. */
  engineId: string
  now?: () => number
}

/**
 * Starts, tracks and persists reviews. One analysis runs at a time (the engine pool already uses
 * every core); others wait their turn. Requests are written to storage first, so a reload during
 * a review resumes it instead of losing it.
 */
export class ReviewService {
  private jobs = new Map<string, Job>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private deps: ReviewServiceDeps) {}

  /** The id a game would have under the given preset and engine. Stable across sessions and devices. */
  idFor(pgn: string, preset: PresetName, engineId = this.deps.engineId): Promise<string> {
    return reviewKey(pgn, settingsFor(preset, engineId))
  }

  /** Starts a review (or finds the finished one) and returns its id. */
  async start(pgn: string, preset: PresetName, engineId = this.deps.engineId): Promise<string> {
    const id = await this.idFor(pgn, preset, engineId)
    if (this.jobs.get(id)?.state.status === 'running') return id
    if (await this.deps.store.getReview(id)) return id
    parseGame(pgn) // reject bad input before queueing anything
    await this.deps.store.putRequest({
      id,
      pgn,
      preset,
      engine: engineId,
      createdAt: (this.deps.now ?? Date.now)(),
    })
    this.launch(id, pgn, preset, engineId)
    return id
  }

  /** Accuracy and trace for already-reviewed games, keyed by id. Used by the game list. */
  summaries(ids: readonly string[]) {
    return this.deps.store.summaries(ids)
  }

  /** Every review stored on this device. */
  allReviews() {
    return this.deps.store.allReviews()
  }

  /** Makes sure the review for `id` is running, finished or known to be missing, and returns its state. */
  async open(id: string): Promise<JobState> {
    const live = this.jobs.get(id)
    if (live) return live.state
    const stored = await this.deps.store.getReview(id)
    if (stored) return this.track(id, { status: 'done', review: stored.review }).state
    const request = await this.deps.store.getRequest(id)
    if (request) {
      // Requests from before engines were selectable used the default build.
      this.launch(id, request.pgn, request.preset, request.engine ?? this.deps.engineId)
      return this.jobs.get(id)!.state
    }
    return { status: 'missing' }
  }

  /** Current state, then every change. Returns an unsubscribe function. */
  subscribe(id: string, listener: (s: JobState) => void): () => void {
    void this.open(id).then((state) => {
      const job = this.jobs.get(id)
      if (job) {
        job.listeners.add(listener)
        listener(job.state)
      } else {
        listener(state)
      }
    })
    return () => this.jobs.get(id)?.listeners.delete(listener)
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (job?.state.status !== 'running') return
    job.controller.abort()
  }

  private track(id: string, state: JobState): Job {
    const job: Job = { state, listeners: new Set(), controller: new AbortController() }
    this.jobs.set(id, job)
    return job
  }

  private set(id: string, state: JobState): void {
    const job = this.jobs.get(id)
    if (!job) return
    job.state = state
    for (const l of [...job.listeners]) l(state)
  }

  private launch(id: string, pgn: string, preset: PresetName, engineId: string): void {
    const job = this.track(id, { status: 'running', done: 0, total: 0 })
    const run = async () => {
      if (job.controller.signal.aborted) throw new AnalysisAborted()
      const settings = settingsFor(preset, engineId)
      const game = parseGame(pgn)
      const book = await this.deps.loadBook()
      const host = await this.deps.engine(engineId)
      const records = await host.use((engine) =>
        evaluatePositions(game, engine, settings, {
          signal: job.controller.signal,
          onProgress: (done, total) => this.set(id, { status: 'running', done, total }),
        }),
      )
      // An engine may finish a search that was already running when the user cancelled.
      if (job.controller.signal.aborted) throw new AnalysisAborted()
      const review = buildReview(game, records, book, settings)
      await this.deps.store.putReview({
        id,
        pgn,
        review,
        summary: summarize(review),
        createdAt: (this.deps.now ?? Date.now)(),
      })
      await this.deps.store.deleteRequest(id)
      this.set(id, { status: 'done', review })
    }
    this.queue = this.queue.then(run).catch(async (e: unknown) => {
      if (e instanceof AnalysisAborted) {
        await this.deps.store.deleteRequest(id)
        this.set(id, { status: 'missing' }) // tell listeners before forgetting the job
        this.jobs.delete(id)
        return
      }
      console.error('review failed', e)
      // A game that can never be analysed must not be retried on every reload.
      if (e instanceof InvalidPgnError) await this.deps.store.deleteRequest(id)
      this.set(id, { status: 'error', message: friendly(e) })
    })
  }
}

function friendly(e: unknown): string {
  if (e instanceof InvalidPgnError) return `That PGN couldn’t be read: ${e.message}`
  if (e instanceof EngineNotInstalled) return e.message
  if (e instanceof EngineError) {
    return `The chess engine couldn’t run in this browser (${e.message.replace(/\.$/, '')}). Try a current Chrome, Firefox or Safari, and check that no extension is blocking WebAssembly or web workers.`
  }
  if (e instanceof Error) return `The analysis failed: ${e.message}`
  return 'The analysis failed.'
}
