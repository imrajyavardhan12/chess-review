import { describe, expect, it } from 'vitest'
import { explainMove, findMotif, outcome, replay, type Motif, type MoveFacts } from '../src'
import { isBackRankMate } from '../src/tactics/explain'
import { Board } from '../src/tactics/board'

/**
 * Positions from the Lichess puzzle database (CC0), each checked by hand. A puzzle's first move is
 * the mistake; the rest is the line that punishes it, which is what the detectors read.
 */
function motifIn(fen: string, moves: string): Motif | null {
  const [mistake, ...line] = moves.split(' ')
  const start = replay(fen, [mistake!])[0]!
  return findMotif(start.after, replay(start.after, line), start.after.split(' ')[1] === 'b' ? 'b' : 'w')
}

describe('tactic detectors on known puzzles', () => {
  it.each([
    // Qb5+ hits the king on e2 and the loose rook on e8 (Lichess 00Lyc).
    [
      'fork',
      '4R3/1p4k1/1q1N1bpp/3B4/5p1P/p4P2/3RK1P1/8 w - - 4 42',
      'd6e4 b6b5 d2d3 b5e8',
      ['b5', 'e2', 'e8'],
    ],
    // Nf4+ hits the king on d5 and the bishop on e2 (00K0G).
    ['fork', '8/8/8/2Pk4/pK4p1/3N4/5P2/3b4 b - - 7 59', 'd1e2 d3f4 d5c6 f4e2', ['f4', 'd5', 'e2']],
    // Bb5 pins the queen to the king; the queen takes the bishop and is taken (00ZeT).
    ['pin', '1Q1k4/4r3/2q4p/2p1pp1P/2Bb4/1P6/P6K/4R3 b - - 4 43', 'd8d7 c4b5 c6b5 b8b5', ['c6', 'b5', 'd7']],
    // Bh6 pins the queen on e3 to the king on c1 (00WnZ).
    [
      'pin',
      'r1b1kb1r/pp2q3/2n3p1/2p1P2p/5Q2/1P2pN2/PBP3PP/2KR1B1R w kq - 0 16',
      'f4e3 f8h6 e3h6 h8h6',
      ['e3', 'h6', 'c1'],
    ],
    // Bb4 pins the queen on d6 to the king; that is a pin, not a trapped queen (02jBf).
    [
      'pin',
      'r1b4r/1p1pkppp/pq1Np3/3Bn3/8/P4P2/1P1B2PP/R2QK2R b KQ - 0 17',
      'b6d6 d2b4 d6b4 a3b4',
      ['d6', 'b4', 'e7'],
    ],
    // Rh7+ and the rook on a7 behind the king falls (00KOz).
    ['skewer', '8/r4k2/7R/5PK1/1n6/8/8/8 b - - 3 56', 'b4d5 h6h7 f7f8 h7a7', ['f7', 'h7', 'a7']],
    // Rf7+ and the queen on f4 behind the king falls (001xl).
    ['skewer', '8/4R1k1/p5pp/3B4/5q2/8/5P1P/6K1 b - - 5 40', 'g7f6 e7f7 f6e5 f7f4', ['f6', 'f7', 'f4']],
    // d4+ uncovers the bishop on e4 against the rook on a8 (00Gt0).
    [
      'discoveredAttack',
      'R7/4k3/5p2/3p2p1/4b2p/2K1P2P/5PP1/8 w - - 2 47',
      'f2f3 d5d4 c3d4 e4a8',
      ['a8', 'e4', 'd4'],
    ],
    // Bxh2+ uncovers the queen on d8 against the queen on d4 (00DTg).
    [
      'discoveredAttack',
      'r2qk2r/1pp2ppp/p1pb1n2/4P3/3Q4/2N2b2/PPP2PPP/R1B2RK1 w kq - 0 10',
      'e5f6 d6h2 g1h2 d8d4',
      ['d4', 'd8', 'h2'],
    ],
    // Rxd1+ takes a bishop nothing defends (00HEx).
    ['hanging', 'b7/5pk1/R3pn1p/8/3NP3/5P2/6PP/2rB2K1 w - - 1 31', 'a6a8 c1d1 g1f2 d1d4', ['d1', 'c1']],
    // Ne4 attacks the rook on f2, which has nowhere safe to go (000tp).
    ['trappedPiece', '4r3/5pk1/1p3np1/3p3p/2qQ4/P4N1P/1P3RP1/7K w - - 6 34', 'd4b6 f6e4 h1g1 e4f2', ['f2']],
    // Rb1 traps the queen on b2 (00DdW).
    [
      'trappedPiece',
      '5rk1/4bppp/4b3/1p1pPpPP/2pP4/2P5/rqNQKP2/2RRN3 b - - 5 23',
      'e7a3 c1b1 b2b3 b1b3',
      ['b2'],
    ],
    // Rxd7 Qxd7 pulls the queen off the rook on a8 (0068B).
    [
      'overloadedDefender',
      'r1q3k1/4bppp/pp2pn2/4B3/8/2N2Q2/PPPR1PPP/6K1 b - - 0 18',
      'f6d7 d2d7 c8d7 f3a8',
      ['c8', 'd7', 'a8'],
    ],
    // Rxd3 Rxd3 pulls the rook off a1 (00rAM).
    [
      'overloadedDefender',
      '3rr1k1/1p3pq1/p1n1b2p/2b3p1/Q7/P2BPNB1/1P3PPP/R2R2K1 w - - 0 20',
      'b2b4 d8d3 d1d3 g7a1',
      ['d1', 'd3', 'a1'],
    ],
  ] as const)('%s: %s', (kind, fen, moves, squares) => {
    const m = motifIn(fen, moves)
    expect(m?.kind).toBe(kind)
    const named = JSON.stringify(m)
    for (const sq of squares) expect(named).toContain(`"${sq}"`)
  })

  it('does not call it a pin when the pinner simply takes what it attacks (00Y1c)', () => {
    expect(motifIn('5rk1/Q4p2/5p1p/2q5/8/8/P1r2PPP/3RR1K1 w - - 4 23', 'a7d7 c5f2 g1h1 f2g2')?.kind).not.toBe(
      'pin',
    )
  })

  it('does not call a check that only wins a pawn a discovered attack (00h8Z)', () => {
    expect(
      motifIn('5k2/p1R4R/1p4p1/3r3q/3P4/2P2rQp/PP5K/8 b - - 4 36', 'f3g3 c7c8 d5d8 c8d8')?.kind,
    ).not.toBe('discoveredAttack')
  })

  it('does not call a double attack on defended pieces a fork when nothing is won', () => {
    // Qd3 attacks both knights, but pawns guard them and the line wins nothing.
    const fen = '4k3/8/2p1p3/3n1n2/8/8/8/3QK3 w - - 0 1'
    expect(findMotif(fen, replay(fen, ['d1d3', 'e8d7']), 'w')).toBeNull()
  })

  it('finds nothing in a quiet line', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(findMotif(fen, replay(fen, ['e2e4', 'e7e5', 'g1f3', 'b8c6']), 'w')).toBeNull()
  })
})

describe('line helpers', () => {
  it('stops a line at the first illegal move instead of throwing', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(replay(fen, ['e2e4', 'e2e4', 'e7e5']).map((s) => s.san)).toEqual(['e4'])
    expect(replay('not a fen', ['e2e4'])).toEqual([])
  })

  it('settles material at the end of a line, crediting a capture still on the board', () => {
    // Bxc6 dxc6 is an even trade; stopping after Bxc6 still counts Black's recapture.
    const fen = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'
    expect(outcome(fen, ['b5c6', 'd7c6', 'e1g1'], 'w')).toBe(0)
    // ...and stopping after dxc6 credits White with the loose e5 pawn it can now take.
    expect(outcome(fen, ['b5c6', 'd7c6'], 'w')).toBe(1)
    expect(outcome(fen, ['b5c6'], 'w')).toBe(0)
    expect(outcome(fen, ['b5c6'], 'b')).toBe(0)
  })

  it('counts promotions as material', () => {
    expect(outcome('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'], 'w')).toBe(8)
  })

  it('reads attacks and lines off a board', () => {
    const b = new Board('4k3/8/8/8/8/8/8/R3K2R w - - 0 1')
    expect(b.attackers('e1', 'w')).toEqual(['a1', 'h1'])
    expect(b.ray('a1', [1, 0]).map((x) => x.square)).toEqual(['e1', 'h1'])
    expect(b.material('w')).toBe(10)
  })

  it('recognises a back-rank mate, and not a mate elsewhere', () => {
    expect(isBackRankMate(replay('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', ['a1a8']))).toBe(true)
    // Fool's mate: mate, but not on the back rank by a rook or queen along it.
    expect(
      isBackRankMate(replay('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', ['d8h4'])),
    ).toBe(false)
  })
})

const facts = (f: Partial<MoveFacts> & Pick<MoveFacts, 'fenBefore' | 'played' | 'label'>): MoveFacts => ({
  before: { cp: 0, mate: null, line: [] },
  after: { cp: 0, mate: null, line: [] },
  ...f,
})

describe('explainMove', () => {
  it('names a fork the move allowed, with the squares to show', () => {
    const e = explainMove(
      facts({
        fenBefore: '4R3/1p4k1/1q1N1bpp/3B4/5p1P/p4P2/3RK1P1/8 w - - 4 42',
        played: 'd6e4',
        label: 'Blunder',
        before: { cp: 250, mate: null, line: ['e8e6'] },
        after: { cp: -400, mate: null, line: ['b6b5', 'd2d3', 'b5e8'] },
      }),
    )
    expect(e).toMatchObject({
      kind: 'fork',
      perspective: 'allowed',
      text: 'Allows a fork: Qb5+ attacks the king and the rook on e8.',
      fen: '4R3/1p4k1/1q3bpp/3B4/4Np1P/p4P2/3RK1P1/8 b - - 5 42',
      line: ['b6b5', 'd2d3', 'b5e8'],
      at: 0,
    })
    expect(e!.squares).toEqual(['b5', 'e2', 'e8'])
  })

  it('names a missed back-rank mate', () => {
    const e = explainMove(
      facts({
        fenBefore: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        played: 'h2h3',
        label: 'Blunder',
        before: { cp: 9999, mate: 1, line: ['a1a8'] },
        after: { cp: 0, mate: null, line: ['g8f8'] },
      }),
    )
    expect(e).toMatchObject({
      kind: 'backRankMate',
      perspective: 'missed',
      text: 'Missed a back-rank mate in 1, starting with Ra8#.',
    })
  })

  it('names a mate the move allowed (Lichess 00w1s)', () => {
    const e = explainMove(
      facts({
        fenBefore: 'rn2Q1k1/pb1q1p1p/1p1p2pB/3P3n/8/2bB1N1P/PP3PP1/4R1K1 b - - 1 18',
        played: 'd7e8',
        label: 'Blunder',
        before: { cp: -300, mate: null, line: ['g8e8'] },
        after: { cp: 9999, mate: 1, line: ['e1e8'] },
      }),
    )
    expect(e).toMatchObject({
      kind: 'backRankMate',
      perspective: 'allowed',
      text: 'Allows a back-rank mate in 1, starting with Rxe8#.',
    })
  })

  it('names the tactic in a great move', () => {
    const e = explainMove(
      facts({
        fenBefore: '8/8/8/2Pk4/pK4p1/3N4/4bP2/8 w - - 8 60',
        played: 'd3f4',
        label: 'Great',
        after: { cp: 700, mate: null, line: ['d5c6', 'f4e2'] },
      }),
    )
    expect(e).toMatchObject({
      kind: 'fork',
      perspective: 'played',
      text: 'A fork: Nf4+ attacks the king and the bishop on e2.',
    })
  })

  it('for a Miss, names the chance that went unused first', () => {
    const e = explainMove(
      facts({
        fenBefore: 'R7/5pk1/4pn1p/8/3NP3/5P2/6PP/2rB2K1 b - - 0 31',
        played: 'f6e8',
        label: 'Miss',
        before: { cp: -500, mate: null, line: ['c1d1', 'g1f2', 'd1d4'] },
        after: { cp: 0, mate: null, line: ['d4e6'] },
      }),
    )
    // Rxd1+ takes a loose bishop, but the fork it makes with the knight on d4 is the bigger story.
    expect(e).toMatchObject({
      kind: 'fork',
      perspective: 'missed',
      text: 'Missed a fork: Rxd1+ attacks the king and the knight on d4.',
    })
  })

  it('names a piece left hanging', () => {
    const e = explainMove(
      facts({
        fenBefore: '4k3/8/8/4n3/8/8/8/3QK3 b - - 0 1',
        played: 'e5g4',
        label: 'Blunder',
        before: { cp: 400, mate: null, line: ['e8f7'] },
        after: { cp: 1200, mate: null, line: ['d1g4', 'e8f7'] },
      }),
    )
    expect(e).toMatchObject({
      kind: 'hanging',
      perspective: 'allowed',
      text: 'Leaves the undefended knight on g4: Qxg4 wins it.',
    })
    expect(e!.squares).toEqual(['g4', 'd1'])
  })

  it('calls taking back an equal piece a recapture, not a win', () => {
    const e = explainMove(
      facts({
        fenBefore: 'r1bqkbnr/1ppp1ppp/p1B5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4',
        played: 'd7c6',
        label: 'Great',
        previous: { uci: 'b5c6', captured: 'n' },
        after: { cp: 0, mate: null, line: ['e1g1', 'f7f6'] },
      }),
    )
    expect(e).toMatchObject({
      kind: 'recapture',
      perspective: 'played',
      text: 'Takes back the bishop on c6.',
    })
  })

  it('falls back to the material the line wins, quoting only moves that capture', () => {
    // Blackburne Shilling trap: 5.Nxf7?? Qxg2 and the rook on h1 goes too.
    const e = explainMove(
      facts({
        fenBefore: 'r1b1kbnr/pppp1ppp/8/4N1q1/2BnP3/8/PPPP1PPP/RNBQK2R w KQkq - 1 5',
        played: 'e5f7',
        label: 'Blunder',
        before: { cp: -63, mate: null, line: 'c4f7 e8d8 e1g1 g5e5 d2d3 e5f6 f7c4 b7b5'.split(' ') },
        after: { cp: -550, mate: null, line: 'g5g2 d2d3 g2h1 e1d2 h1d1 d2d1 b7b5 c4d5'.split(' ') },
      }),
    )
    expect(e).toMatchObject({
      kind: 'material',
      perspective: 'allowed',
      text: 'Loses material: after Qxg2 d3 Qxh1+ Kd2 Qxd1+ Kxd1, Black has won about a rook.',
    })
  })

  it('does not call an even trade a hanging piece', () => {
    const e = explainMove(
      facts({
        fenBefore: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
        played: 'b5c6',
        label: 'Mistake',
        before: { cp: 40, mate: null, line: ['b5a4'] },
        after: { cp: -60, mate: null, line: ['d7c6', 'e1g1'] },
      }),
    )
    expect(e).toBeNull()
  })

  it('says nothing for labels it does not explain, or when the lines show no tactic', () => {
    const base = {
      fenBefore: '4R3/1p4k1/1q1N1bpp/3B4/5p1P/p4P2/3RK1P1/8 w - - 4 42',
      played: 'd6e4',
      before: { cp: 250, mate: null, line: ['e8e6'] },
      after: { cp: -400, mate: null, line: ['b6b5', 'd2d3', 'b5e8'] },
    }
    expect(explainMove(facts({ ...base, label: 'Inaccuracy' }))).toBeNull()
    expect(explainMove(facts({ ...base, label: 'Book' }))).toBeNull()
    expect(
      explainMove(facts({ ...base, label: 'Mistake', after: { cp: -100, mate: null, line: ['g7g8'] } })),
    ).toBeNull()
    expect(explainMove(facts({ ...base, played: 'a1a2', label: 'Mistake' }))).toBeNull() // not a legal move
  })
})
