import { describe, expect, it, vi } from 'vitest'
import { LichessError, fetchLichessGames } from '../src/services/lichess'

const game = (over: Record<string, unknown> = {}) => ({
  id: 'abcd1234',
  variant: 'standard',
  speed: 'blitz',
  status: 'mate',
  createdAt: 1_000_000,
  lastMoveAt: 2_000_000,
  winner: 'white',
  clock: { initial: 180, increment: 2 },
  players: { white: { user: { name: 'Ann' }, rating: 1500 }, black: { user: { name: 'Bob' }, rating: 1400 } },
  pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 1-0',
  ...over,
})
const ndjson = (games: unknown[], status = 200) =>
  new Response(games.map((g) => JSON.stringify(g)).join('\n') + '\n', { status })

describe('fetchLichessGames', () => {
  it('asks for recent games as ndjson with clocks and openings', async () => {
    const f = vi.fn().mockResolvedValue(ndjson([]))
    await fetchLichessGames(' Some User ', 30, f)
    expect(f).toHaveBeenCalledWith(
      'https://lichess.org/api/games/user/Some%20User?max=30&pgnInJson=true&clocks=true&opening=true',
      { headers: { Accept: 'application/x-ndjson' } },
    )
  })

  it('maps games, results and time controls, newest first', async () => {
    const f = vi.fn().mockResolvedValue(
      ndjson([
        game(),
        game({ id: 'b', winner: undefined, status: 'draw', lastMoveAt: 3_000_000 }),
        game({
          id: 'c',
          winner: 'black',
          clock: undefined,
          speed: 'correspondence',
          lastMoveAt: 2_500_000,
        }),
      ]),
    )
    const games = await fetchLichessGames('ann', 30, f)
    expect(games.map((g) => [g.url, g.result, g.timeControl, g.endTime])).toEqual([
      ['https://lichess.org/b', '1/2-1/2', '180+2', 3000],
      ['https://lichess.org/c', '0-1', '-', 2500],
      ['https://lichess.org/abcd1234', '1-0', '180+2', 2000],
    ])
    expect(games[2]).toMatchObject({ white: 'Ann', black: 'Bob', whiteRating: 1500, timeClass: 'blitz' })
  })

  it('skips variants, aborted games and games without a PGN, and names computer opponents', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        ndjson([
          game({ id: 'v', variant: 'chess960' }),
          game({ id: 'a', status: 'aborted' }),
          game({ id: 'p', pgn: undefined }),
          game({ id: 'ai', players: { white: { user: { name: 'Ann' } }, black: { aiLevel: 3 } } }),
        ]),
      )
    const games = await fetchLichessGames('ann', 30, f)
    expect(games.map((g) => [g.url, g.black])).toEqual([['https://lichess.org/ai', 'Stockfish level 3']])
  })

  it('explains failures in words a user can act on', async () => {
    await expect(
      fetchLichessGames('x', 30, vi.fn().mockResolvedValue(new Response('', { status: 404 }))),
    ).rejects.toThrow('Lichess has no player named “x”.')
    await expect(
      fetchLichessGames('x', 30, vi.fn().mockResolvedValue(new Response('', { status: 429 }))),
    ).rejects.toMatchObject({
      kind: 'rate-limited',
    })
    await expect(
      fetchLichessGames('x', 30, vi.fn().mockRejectedValue(new TypeError('failed'))),
    ).rejects.toBeInstanceOf(LichessError)
  })
})
