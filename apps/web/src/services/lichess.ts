/**
 * Browser client for the public Lichess games export (no login). Lichess sends
 * Access-Control-Allow-Origin: * on its API, and the request uses only CORS-safe headers.
 */
import type { RemoteGame } from './chesscom'

const API = 'https://lichess.org/api/games/user'

export class LichessError extends Error {
  override name = 'LichessError'
  constructor(
    readonly kind: 'not-found' | 'unavailable' | 'network' | 'rate-limited',
    message: string,
  ) {
    super(message)
  }
}

interface RawGame {
  id: string
  variant: string
  speed: string
  status: string
  lastMoveAt: number
  createdAt: number
  winner?: 'white' | 'black'
  clock?: { initial: number; increment: number }
  players: {
    white: { user?: { name: string }; rating?: number; aiLevel?: number }
    black: { user?: { name: string }; rating?: number; aiLevel?: number }
  }
  pgn?: string
}

const name = (p: RawGame['players']['white']) =>
  p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous')

/** Lichess's result: a winner, or a draw for a finished game without one. */
export function resultOf(g: Pick<RawGame, 'winner'>): RemoteGame['result'] {
  return g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2'
}

/**
 * A player's most recent standard games, newest first, with clocks and openings in the PGN.
 * Aborted games and variants are skipped.
 */
export async function fetchLichessGames(
  user: string,
  max = 30,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteGame[]> {
  const who = encodeURIComponent(user.trim())
  const url = `${API}/${who}?max=${max}&pgnInJson=true&clocks=true&opening=true`
  let res: Response
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/x-ndjson' }, cache: 'no-cache' })
  } catch {
    throw new LichessError('network', 'Couldn’t reach Lichess. Check your connection.')
  }
  if (res.status === 404) throw new LichessError('not-found', `Lichess has no player named “${user.trim()}”.`)
  if (res.status === 429)
    throw new LichessError('rate-limited', 'Lichess asked us to slow down. Try again in a minute.')
  if (!res.ok) throw new LichessError('unavailable', 'Lichess isn’t responding. Try again in a moment.')
  const text = await res.text()
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RawGame)
    .filter(
      (g): g is RawGame & { pgn: string } => g.variant === 'standard' && g.status !== 'aborted' && !!g.pgn,
    )
    .map((g) => ({
      url: `https://lichess.org/${g.id}`,
      pgn: g.pgn,
      white: name(g.players.white),
      black: name(g.players.black),
      result: resultOf(g),
      timeClass: g.speed,
      timeControl: g.clock ? `${g.clock.initial}+${g.clock.increment}` : '-',
      whiteRating: g.players.white.rating ?? null,
      blackRating: g.players.black.rating ?? null,
      endTime: Math.floor(g.lastMoveAt / 1000),
    }))
    .sort((a, b) => b.endTime - a.endTime)
}
