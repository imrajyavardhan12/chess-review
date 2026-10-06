import { PRESETS, exportJson, exportPgn } from '@chessreview/core'
import { useEffect, useEffectEvent, useState } from 'react'
import { usePrefs } from './prefs'
import { getLiveAnalysis, getReviewService, type JobState, type LiveEval } from './services'
import type { ReviewService } from './services/reviews'

/** Live state of one review: null until the service has answered for this id. */
export function useReviewState(id: string): JobState | null {
  // Keyed by id so a stale answer for the previous review is never shown for the new one.
  const [entry, setEntry] = useState<{ id: string; state: JobState } | null>(null)
  useEffect(() => {
    let off: () => void = () => undefined
    let stale = false
    void getReviewService().then((service) => {
      if (!stale) off = service.subscribe(id, (state) => setEntry({ id, state }))
    })
    return () => {
      stale = true
      off()
    }
  }, [id])
  return entry?.id === id ? entry.state : null
}

export async function cancelReview(id: string): Promise<void> {
  ;(await getReviewService()).cancel(id)
}

export interface Async<T> {
  /** The latest successful result, even if it was for earlier inputs (so lists don't flash empty). */
  value: T | undefined
  /** True while the result for the current key hasn't arrived. */
  loading: boolean
  /** An error from the current key's request, if it failed. */
  error: unknown
}

/**
 * Runs `load` whenever `key` changes (null means "don't"), ignoring answers for superseded keys and
 * aborting their signal, so work nobody wants any more can stop.
 * Loading and error are derived from the key rather than stored, so there is no reset to forget.
 */
export function useAsync<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Async<T> {
  const [settled, setSettled] = useState<{ key: string; value?: T; error?: unknown } | null>(null)
  const [last, setLast] = useState<T | undefined>(undefined)
  const run = useEffectEvent(load)

  useEffect(() => {
    if (key === null) return
    let stale = false
    const controller = new AbortController()
    run(controller.signal).then(
      (value) => {
        if (stale) return
        setSettled({ key, value })
        setLast(value)
      },
      (error: unknown) => {
        if (!stale) setSettled({ key, error })
      },
    )
    return () => {
      stale = true
      controller.abort()
    }
  }, [key])

  const current = settled?.key === key ? settled : null
  return { value: last, loading: key !== null && current === null, error: current?.error }
}

/**
 * The engine's live view of a position being explored, at the user's analysis setting. Moving on
 * cancels the search for the position left behind. Undefined until the answer for this position arrives.
 */
export function useLiveEval(fen: string | null): {
  live: LiveEval | undefined
  /** The previous answer, for display while the next one is on its way. */
  last: LiveEval | undefined
  thinking: boolean
  error: unknown
} {
  const { preset } = usePrefs()
  const r = useAsync(fen === null ? null : `${fen}|${preset}`, (signal) =>
    getLiveAnalysis().analyse(fen!, PRESETS[preset], signal),
  )
  return { live: r.loading ? undefined : r.value, last: r.value, thinking: r.loading, error: r.error }
}

/** Reviews running or waiting, and how many have finished this session; updates as they progress. */
export function useQueue(): { active: ReturnType<ReviewService['active']>; completed: number } {
  const [state, setState] = useState<{ active: ReturnType<ReviewService['active']>; completed: number }>({
    active: [],
    completed: 0,
  })
  useEffect(() => {
    let off: () => void = () => undefined
    let stale = false
    void getReviewService().then((service) => {
      if (stale) return
      const update = () => setState({ active: service.active(), completed: service.completed })
      off = service.onChange(update)
      update()
    })
    return () => {
      stale = true
      off()
    }
  }, [])
  return state
}

/** Saves a review as an annotated PGN or as a review file, through the browser's download. */
export async function downloadReview(id: string, kind: 'pgn' | 'json'): Promise<void> {
  const stored = await (await getReviewService()).stored(id)
  if (!stored) return
  const { review } = stored
  const text = kind === 'pgn' ? exportPgn(review) : exportJson(id, stored.pgn, review)
  const date = /^\d{4}\.\d{2}\.\d{2}$/.test(review.headers.Date ?? '')
    ? review.headers.Date!.replaceAll('.', '-')
    : ''
  const base = [review.white, 'vs', review.black, date]
    .filter(Boolean)
    .join(' ')
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  const blob = new Blob([text], { type: kind === 'pgn' ? 'application/x-chess-pgn' : 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${base || 'review'}${kind === 'pgn' ? '.pgn' : '.chessreview.json'}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
