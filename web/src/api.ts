import type { GamesResponse, JobState } from './types'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export const getGames = (user: string, month?: string) =>
  fetch(`/api/chesscom/${encodeURIComponent(user)}${month ? `?month=${month}` : ''}`).then(
    json<GamesResponse>,
  )

export const startReview = (pgn: string) =>
  fetch('/api/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pgn }),
  }).then(json<{ id: string; status: string }>)

export const getReview = (id: string) => fetch(`/api/reviews/${id}`).then(json<JobState>)
