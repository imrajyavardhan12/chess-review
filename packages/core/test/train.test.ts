import { describe, expect, it } from 'vitest'
import {
  BOX_DAYS,
  RETRY_MS,
  answer,
  freshProgress,
  pickNext,
  puzzleTactic,
  queue,
  summarize,
  today,
  withTactic,
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

describe('withTactic', () => {
  it('keeps only the puzzles whose mistake had that tactic, and everything for null', () => {
    const rs = [record('a', { tactic: 'fork' }), record('b', { tactic: 'pin' }), record('c')]
    expect(withTactic(rs, 'fork').map((r) => r.id)).toEqual(['a'])
    expect(withTactic(rs, 'skewer')).toEqual([])
    expect(withTactic(rs, null)).toBe(rs)
  })
})

describe('withTactic and perspective', () => {
  const rs = [
    record('a', { tactic: 'fork', perspective: 'allowed' }),
    record('b', { tactic: 'fork', perspective: 'missed' }),
    record('c', { tactic: 'fork' }), // made before the side was kept
    record('d', { tactic: 'fork', perspective: null }), // the side could not be worked out
  ]

  it('tells allowing a tactic from missing it', () => {
    expect(withTactic(rs, 'fork', 'allowed').map((r) => r.id)).toEqual(['a'])
    expect(withTactic(rs, 'fork', 'missed').map((r) => r.id)).toEqual(['b'])
  })

  it('without a side, keeps every puzzle of the tactic, including those with no side recorded', () => {
    expect(withTactic(rs, 'fork').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('a side without a tactic is no focus at all', () => {
    expect(withTactic(rs, null, 'missed')).toBe(rs)
  })
})

describe('puzzleTactic', () => {
  it('keeps the kind and side of a tactic the player allowed or missed', () => {
    expect(puzzleTactic({ kind: 'fork', perspective: 'allowed' })).toEqual({
      tactic: 'fork',
      perspective: 'allowed',
    })
    expect(puzzleTactic({ kind: 'pin', perspective: 'missed' })).toEqual({
      tactic: 'pin',
      perspective: 'missed',
    })
  })

  it('has none for a tactic the player played, or when there was nothing to explain', () => {
    expect(puzzleTactic({ kind: 'fork', perspective: 'played' })).toEqual({ tactic: null, perspective: null })
    expect(puzzleTactic(null)).toEqual({ tactic: null, perspective: null })
  })
})

describe('today', () => {
  const START = NOW - 3 * 60 * 60 * 1000
  const asked = (id: string, lastAt: number) =>
    record(id, { progress: { box: 1, due: NOW + DAY, attempts: 1, solved: 1, lastAt } })

  it('counts what was answered since the day began, and what is still to do up to the goal', () => {
    const rs = [asked('a', START + 1), asked('b', START - 1), record('c'), record('d'), record('e', {}, null)]
    expect(today(rs, NOW, START, 10)).toEqual({ done: 1, target: 3 })
  })

  it('stops the target at the goal, and counts a puzzle once however often it was answered', () => {
    const fresh = Array.from({ length: 20 }, (_, i) => record(`n${i}`))
    expect(today([asked('a', START + 5), ...fresh], NOW, START, 8)).toEqual({ done: 1, target: 8 })
    expect(today([asked('a', START + 5)], NOW, START, 8)).toEqual({ done: 1, target: 1 })
  })

  it('never shows a target below what is done, even past the goal', () => {
    const rs = Array.from({ length: 5 }, (_, i) => asked(`a${i}`, START + i))
    expect(today(rs, NOW, START, 3)).toEqual({ done: 5, target: 5 })
  })

  it('counts a puzzle answered wrongly and waiting for its retry as done, not as still to do', () => {
    const wrong = record('w', {
      progress: { box: 0, due: NOW + RETRY_MS, attempts: 1, solved: 0, lastAt: NOW },
    })
    expect(today([wrong, record('n')], NOW, START, 10)).toEqual({ done: 1, target: 2 })
  })
})
