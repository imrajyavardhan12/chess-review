/** Browser client for the public chess.com API (it allows cross-origin requests; no login needed). */

const API = 'https://api.chess.com/pub/player'

export interface RemoteGame {
  url: string
  pgn: string
  white: string
  black: string
  result: '1-0' | '0-1' | '1/2-1/2'
  timeClass: string
  timeControl: string
  whiteRating: number | null
  blackRating: number | null
  /** Unix seconds. */
  endTime: number
}

export class ChessComError extends Error {
  override name = 'ChessComError'
  constructor(
    readonly kind: 'not-found' | 'unavailable' | 'network',
    message: string,
  ) {
    super(message)
  }
}

interface RawGame {
  url: string
  pgn?: string
  rules?: string
  time_class: string
  time_control?: string
  end_time: number
  white: { username: string; rating?: number; result: string }
  black: { username: string; rating?: number; result: string }
}

async function getJson<T>(url: string, user: string, fetchImpl: typeof fetch): Promise<T> {
  let res: Response
  try {
    res = await fetchImpl(url)
  } catch {
    throw new ChessComError('network', 'Couldn’t reach chess.com. Check your connection.')
  }
  if (res.status === 404) throw new ChessComError('not-found', `chess.com has no player named “${user}”.`)
  if (!res.ok) throw new ChessComError('unavailable', 'chess.com isn’t responding. Try again in a moment.')
  return (await res.json()) as T
}

/** Months with games, newest first, as `YYYY/MM`. */
export async function listMonths(user: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const name = encodeURIComponent(user.trim().toLowerCase())
  const { archives } = await getJson<{ archives: string[] }>(`${API}/${name}/games/archives`, user, fetchImpl)
  return archives
    .map((a) => a.split('/games/')[1])
    .filter((m): m is string => !!m)
    .reverse()
}

export function resultOf(g: Pick<RawGame, 'white' | 'black'>): RemoteGame['result'] {
  if (g.white.result === 'win') return '1-0'
  if (g.black.result === 'win') return '0-1'
  return '1/2-1/2'
}

/** Standard-chess games of a month, newest first. Variants and games without a PGN are skipped. */
export async function fetchMonth(user: string, month: string, fetchImpl: typeof fetch = fetch): Promise<RemoteGame[]> {
  const name = encodeURIComponent(user.trim().toLowerCase())
  const { games } = await getJson<{ games: RawGame[] }>(`${API}/${name}/games/${month}`, user, fetchImpl)
  return games
    .filter((g): g is RawGame & { pgn: string } => !!g.pgn && g.rules === 'chess')
    .map((g) => ({
      url: g.url,
      pgn: g.pgn,
      white: g.white.username,
      black: g.black.username,
      result: resultOf(g),
      timeClass: g.time_class,
      timeControl: g.time_control ?? '',
      whiteRating: g.white.rating ?? null,
      blackRating: g.black.rating ?? null,
      endTime: g.end_time,
    }))
    .sort((a, b) => b.endTime - a.endTime)
}
