import { describe, expect, it } from 'vitest'
import {
  BOX_DAYS,
  RETRY_MS,
  answer,
  freshProgress,
  pickNext,
  queue,
  summarize,
  type Puzzle,
  type PuzzleRecord,
} from '../src'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_000_000_000_000

function record(
  id: string,
  over: Partial<PuzzleRecord> = {},
  puzzle: Partial<Puzzle> | null = {},
): PuzzleRecord {
  return {
    id,
    player: 'me',
    gameId: 'g',
    opponent: 'you',
    date: null,
    tactic: null,
    checkedWith: { depth: 18, nodes: 1 },
    puzzle: puzzle === null ? null : ({ loss: 30, phase: 'middlegame', ...puzzle } as Puzzle),
    progress: freshProgress(),
    ...over,
  }
}

describe('answer', () => {
  it('moves a puzzle up a box and schedules it that many days out', () => {
    const p = answer(freshProgress(), true, NOW)
    expect(p).toMatchObject({ box: 1, due: NOW + BOX_DAYS[1]! * DAY, attempts: 1, solved: 1, lastAt: NOW })
    expect(answer(p, true, NOW).box).toBe(2)
  })

  it('stops at the last box', () => {
    let p = freshProgress()
    for (let i = 0; i < 20; i++) p = answer(p, true, NOW)
    expect(p.box).toBe(BOX_DAYS.length - 1)
  })

  it('sends a wrong answer back to the first box, due again soon', () => {
    const up = answer(answer(freshProgress(), true, NOW), true, NOW)
    expect(answer(up, false, NOW)).toMatchObject({ box: 0, due: NOW + RETRY_MS, attempts: 3, solved: 2 })
  })
})

describe('queue and pickNext', () => {
  const asked = (due: number) => ({ progress: { box: 1, due, attempts: 1, solved: 1, lastAt: 0 } })

  it('splits records into due, fresh and waiting, and leaves out rejected ones', () => {
    const q = queue(
      [record('a', asked(NOW - 1)), record('b'), record('c', asked(NOW + DAY)), record('d', {}, null)],
      NOW,
    )
    expect([q.due, q.fresh, q.waiting].map((l) => l.map((r) => r.id))).toEqual([['a'], ['b'], ['c']])
  })

  it('asks due puzzles first, then new ones with the biggest mistake first', () => {
    const records = [
      record('small', {}, { loss: 22 }),
      record('big', {}, { loss: 60 }),
      record('again', asked(NOW - 5)),
    ]
    expect(pickNext(records, NOW)!.id).toBe('again')
    expect(pickNext(records, NOW, new Set(['again']))!.id).toBe('big')
    expect(pickNext(records, NOW, new Set(['again', 'big', 'small']))).toBeNull()
  })

  it('has nothing to ask when everything is waiting', () => {
    expect(pickNext([record('a', asked(NOW + DAY))], NOW)).toBeNull()
  })
})

describe('summarize', () => {
  it('counts puzzles, answers and how each phase went', () => {
    const s = summarize(
      [
        record(
          'a',
          { progress: { box: 1, due: NOW + DAY, attempts: 3, solved: 2, lastAt: 0 } },
          { phase: 'endgame' },
        ),
        record('b'),
        record('c', {}, null),
      ],
      NOW,
    )
    expect(s).toMatchObject({ total: 2, fresh: 1, due: 0, attempts: 3, solved: 2 })
    expect(s.byPhase.endgame).toEqual({ total: 1, attempts: 3, solved: 2 })
    expect(s.byPhase.middlegame).toEqual({ total: 1, attempts: 0, solved: 0 })
  })
})
