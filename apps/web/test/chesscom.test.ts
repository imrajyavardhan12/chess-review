import { describe, expect, it, vi } from 'vitest'
import { ChessComError, fetchMonth, listMonths } from '../src/services/chesscom'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const game = (over: Record<string, unknown> = {}) => ({
  url: 'https://www.chess.com/game/live/1',
  pgn: '1. e4 e5 *',
  rules: 'chess',
  time_class: 'blitz',
  time_control: '180',
  end_time: 100,
  white: { username: 'Ann', rating: 1500, result: 'win' },
  black: { username: 'Bob', rating: 1400, result: 'resigned' },
  ...over,
})

describe('listMonths', () => {
  it('returns months newest first', async () => {
    const f = vi.fn().mockResolvedValue(
      json({
        archives: [
          'https://api.chess.com/pub/player/ann/games/2026/08',
          'https://api.chess.com/pub/player/ann/games/2026/09',
        ],
      }),
    )
    expect(await listMonths('Ann', f)).toEqual(['2026/09', '2026/08'])
    expect(f).toHaveBeenCalledWith('https://api.chess.com/pub/player/ann/games/archives')
  })

  it('lowercases and encodes the username', async () => {
    const f = vi.fn().mockResolvedValue(json({ archives: [] }))
    await listMonths('  Some User/../x ', f)
    expect(f.mock.calls[0]![0]).toBe('https://api.chess.com/pub/player/some%20user%2F..%2Fx/games/archives')
  })
})

describe('fetchMonth', () => {
  it('maps games, derives the result, and sorts newest first', async () => {
    const f = vi.fn().mockResolvedValue(
      json({
        games: [
          game({ end_time: 100 }),
          game({
            end_time: 300,
            white: { username: 'Ann', result: 'checkmated' },
            black: { username: 'Bob', rating: 1400, result: 'win' },
          }),
          game({
            end_time: 200,
            white: { username: 'Ann', result: 'agreed' },
            black: { username: 'Bob', result: 'agreed' },
          }),
        ],
      }),
    )
    const games = await fetchMonth('ann', '2026/09', f)
    expect(games.map((g) => [g.endTime, g.result])).toEqual([
      [300, '0-1'],
      [200, '1/2-1/2'],
      [100, '1-0'],
    ])
    expect(games[2]).toMatchObject({
      white: 'Ann',
      black: 'Bob',
      whiteRating: 1500,
      timeClass: 'blitz',
      timeControl: '180',
    })
    expect(games[1]!.whiteRating).toBeNull()
  })

  it('skips variants and games without a PGN', async () => {
    const f = vi.fn().mockResolvedValue(
      json({
        games: [game(), game({ rules: 'chess960' }), game({ pgn: undefined }), game({ rules: 'bughouse' })],
      }),
    )
    expect(await fetchMonth('ann', '2026/09', f)).toHaveLength(1)
  })

  it.each([
    [404, 'not-found', /no player named/],
    [500, 'unavailable', /isn’t responding/],
    [429, 'unavailable', /isn’t responding/],
  ] as const)('HTTP %s is a %s error with a readable message', async (status, kind, message) => {
    const f = vi.fn().mockResolvedValue(json({}, status))
    await expect(fetchMonth('ann', '2026/09', f)).rejects.toMatchObject({
      kind,
      message: expect.stringMatching(message),
    })
  })

  it('reports a network failure as such', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(listMonths('ann', f)).rejects.toBeInstanceOf(ChessComError)
    await expect(listMonths('ann', f)).rejects.toMatchObject({ kind: 'network' })
  })
})
