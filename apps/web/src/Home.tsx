import { InvalidPgnError, type PresetName } from '@chessreview/core'
import { useState } from 'react'
import { openReview } from './App'
import { useAsync } from './hooks'
import { usePrefs } from './prefs'
import { Settings } from './Settings'
import {
  ChessComError,
  fetchMonth,
  getReviewService,
  listMonths,
  type RemoteGame,
  type Summary,
} from './services'

const STORE = 'chessreview.user'
const PAGE = 25
const remembered = () => {
  try {
    return localStorage.getItem(STORE) ?? ''
  } catch {
    return ''
  }
}

interface Row {
  game: RemoteGame
  id: string
  summary: Summary | null
}

function timeControl(tc: string): string {
  if (tc.includes('/')) return 'Daily'
  const [base = 0, inc] = tc.split('+').map(Number)
  const mins = base / 60
  return `${Number.isInteger(mins) ? mins : mins.toFixed(1)}${inc ? `+${inc}` : ''} min`
}

function outcome(g: RemoteGame, user: string) {
  const u = user.toLowerCase()
  const side: 'white' | 'black' | null =
    g.white.toLowerCase() === u ? 'white' : g.black.toLowerCase() === u ? 'black' : null
  if (!side) return { side, word: g.result, tone: '' }
  if (g.result === '1/2-1/2') return { side, word: 'Drew', tone: 'draw' }
  const won = (g.result === '1-0') === (side === 'white')
  return { side, word: won ? 'Won' : 'Lost', tone: won ? 'won' : 'lost' }
}

// Win chance over the game from the player's point of view, drawn small.
function Spark({ data }: { data: number[] }) {
  const w = 64
  const h = 22
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} className="spark-mid" />
      <polyline points={pts} className="spark-line" />
    </svg>
  )
}

const messageOf = (e: unknown) =>
  e instanceof ChessComError
    ? e.message
    : e instanceof InvalidPgnError
      ? `That PGN couldn’t be read: ${e.message}`
      : e instanceof Error
        ? e.message
        : 'Something went wrong.'

interface Query {
  user: string
  month?: string
}

interface GamesData {
  user: string
  months: string[]
  month: string | null
  rows: Row[]
}

async function loadGames(q: Query, preset: PresetName): Promise<GamesData> {
  const months = await listMonths(q.user)
  const month = q.month ?? months[0] ?? null
  const games = month ? await fetchMonth(q.user, month) : []
  const service = await getReviewService()
  const ids = await Promise.all(games.map((g) => service.idFor(g.pgn, preset)))
  const summaries = await service.summaries(ids)
  const rows = games.map((game, i) => ({ game, id: ids[i]!, summary: summaries.get(ids[i]!) ?? null }))
  return { user: q.user, months, month, rows }
}

export function Home() {
  const { preset } = usePrefs()
  const [name, setName] = useState(remembered)
  const [query, setQuery] = useState<Query | null>(() => (remembered() ? { user: remembered() } : null))
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')
  const [pgn, setPgn] = useState('')
  const [showAll, setShowAll] = useState(false)

  // Re-runs when the user, month or analysis preset changes (the preset decides which games count as reviewed).
  const games = useAsync(query ? `${query.user}|${query.month ?? ''}|${preset}` : null, () =>
    loadGames(query!, preset),
  )
  const data = games.value
  const busy = games.loading || opening
  const error = games.error ? messageOf(games.error) : openError
  const loaded = data?.user ?? ''
  const months = data?.months ?? []
  const month = data?.month ?? null
  const rows = data?.rows ?? null

  function search(user: string, wanted?: string) {
    setOpenError('')
    setShowAll(false)
    setQuery({ user, month: wanted })
    try {
      localStorage.setItem(STORE, user)
    } catch {
      /* private mode: skip remembering */
    }
  }

  async function open(pgnText: string, me: string | null) {
    setOpening(true)
    setOpenError('')
    try {
      const id = await (await getReviewService()).start(pgnText, preset)
      openReview(id, me)
    } catch (e) {
      setOpenError(messageOf(e))
      setOpening(false)
    }
  }

  const view = (rows ?? []).map((r) => ({ ...r, o: outcome(r.game, loaded) }))
  const tally = (tone: string) => view.filter((r) => r.o.tone === tone).length
  const record = view.some((r) => r.o.side)
    ? `${tally('won')} won, ${tally('lost')} lost, ${tally('draw')} drawn`
    : ''

  return (
    <div className="home">
      <header className="homebar">
        <span className="wordmark">chessreview</span>
        <Settings />
      </header>
      <h1>Review a game</h1>

      <form
        className="userform"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) search(name.trim())
        }}
      >
        <label htmlFor="user">chess.com username</label>
        <div className="userform-row">
          <input
            id="user"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="e.g. hikaru"
          />
          <button className="primary" disabled={busy || !name.trim()}>
            {busy ? 'Loading…' : 'Load games'}
          </button>
        </div>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {rows && (
        <section className="games" aria-label="Games">
          <div className="games-head">
            <div>
              <h2>{loaded}</h2>
              {record && <p className="muted">{record} this month</p>}
            </div>
            <select
              aria-label="Month"
              value={month ?? ''}
              onChange={(e) => search(loaded, e.target.value)}
              disabled={busy}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m.replace('/', '-')}
                </option>
              ))}
            </select>
          </div>
          {view.length === 0 && <p className="muted">No games this month. Try an earlier one.</p>}
          <ul>
            {view.slice(0, showAll ? undefined : PAGE).map(({ game: g, id, summary, o }) => {
              const opp = o.side === 'black' ? g.white : g.black
              const oppRating = o.side === 'black' ? g.whiteRating : g.blackRating
              const acc = summary && o.side ? summary.accuracy[o.side] : null
              const spark =
                summary && summary.spark.length > 1
                  ? o.side === 'black'
                    ? summary.spark.map((v) => 100 - v)
                    : summary.spark
                  : null
              return (
                <li key={id}>
                  <button className="gamerow" disabled={busy} onClick={() => void open(g.pgn, loaded)}>
                    <span className="g-date">
                      {new Date(g.endTime * 1000).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="g-players">
                      <i
                        className={`dot ${o.side ?? 'none'}`}
                        role="img"
                        aria-label={o.side ? `You played ${o.side}` : 'Neither player is you'}
                      />
                      <span>
                        {o.side ? opp : `${g.white} vs ${g.black}`}
                        {o.side && oppRating ? <em> {oppRating}</em> : null}
                      </span>
                    </span>
                    <span className={`g-result ${o.tone}`}>{o.word}</span>
                    <span className="g-acc" title="Your accuracy">
                      {acc !== null ? `${acc.toFixed(0)}%` : ''}
                    </span>
                    <span className="g-spark">{spark && <Spark data={spark} />}</span>
                    <span className="g-time">{timeControl(g.timeControl)}</span>
                    <span className={`g-action${summary ? ' done' : ''}`}>{summary ? 'Open' : 'Review'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!showAll && view.length > PAGE && (
            <button className="ghost more" onClick={() => setShowAll(true)}>
              Show all {view.length} games
            </button>
          )}
        </section>
      )}

      <details className="paste">
        <summary>Paste a PGN instead</summary>
        <textarea
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="1. e4 e5 2. Nf3 Nc6 …"
          aria-label="PGN"
        />
        <button className="primary" disabled={busy || !pgn.trim()} onClick={() => void open(pgn, null)}>
          Review PGN
        </button>
      </details>
    </div>
  )
}
