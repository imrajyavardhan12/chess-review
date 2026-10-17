import { defaultPieces, type PieceRenderObject } from 'react-chessboard'

const PIECE_NAMES: Record<string, string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
  P: 'pawn',
}

/** The default pieces, each named ("White knight, f3") so a screen reader can tell what it would drag. */
export const NAMED_PIECES: PieceRenderObject = Object.fromEntries(
  Object.entries(defaultPieces).map(([code, draw]) => [
    code,
    (props) => (
      <div
        role="img"
        aria-label={`${code[0] === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[code[1]!]}${props?.square ? `, ${props.square}` : ''}`}
        style={{ width: '100%', height: '100%' }}
      >
        {draw(props)}
      </div>
    ),
  ]),
)

/** Pieces slide between moves unless the user asked the system for less motion. */
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export const isLight = (sq: string) => (sq.charCodeAt(0) - 97 + Number(sq[1]) - 1) % 2 === 1
