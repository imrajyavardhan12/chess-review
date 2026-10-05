import { useEffect, useState } from 'react'
import { getGames, startReview } from './api'
import { openReview } from './App'
import { Settings } from './Settings'
import type { GamesResponse, RemoteGame } from './types'

const STORE = 'chessreview.user'
const PAGE = 25
const remembered = () => {
  try {
    return localStorage.getItem(STORE) ?? ''
  } catch {
    return ''
  }
}

function timeControl(tc: string): string {
  if (tc.includes('/')) return 'Daily'
  const [base, inc] = tc.split('+').map(Number)
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

export function Home() {
  const [name, setName] = useState(remembered)
  const [data, setData] = useState<GamesResponse | null>(null)
  const [loaded, setLoaded] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pgn, setPgn] = useState('')
  const [showAll, setShowAll] = useState(false)

  async function load(user: string, month?: string) {
    setBusy(true)
    setError('')
    try {
      setData(await getGames(user, month))
      setShowAll(false)
      setLoaded(user)
      try {
        localStorage.setItem(STORE, user)
      } catch {
        /* private mode: skip remembering */
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (name) load(name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function open(pgnText: string, me: string | null) {
    setBusy(true)
    setError('')
    try {
      const { id } = await startReview(pgnText)
      openReview(id, me)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const rows = (data?.games ?? []).map((g) => ({ g, o: outcome(g, loaded) }))
  const tally = (tone: string) => rows.filter((r) => r.o.tone === tone).length
  const record = rows.some((r) => r.o.side)
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
          if (name.trim()) load(name.trim())
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

      {data && (
        <section className="games" aria-label="Games">
          <div className="games-head">
            <div>
              <h2>{loaded}</h2>
              {record && (
                <p className="muted">
                  {record} {rows.length >= 100 ? 'in the latest 100 games' : 'this month'}
                </p>
              )}
            </div>
            <select
              aria-label="Month"
              value={data.month ?? ''}
              onChange={(e) => load(loaded, e.target.value)}
              disabled={busy}
            >
              {data.months.map((m) => (
                <option key={m} value={m}>
                  {m.replace('/', '-')}
                </option>
              ))}
            </select>
          </div>
          {rows.length === 0 && <p className="muted">No games this month. Try an earlier one.</p>}
          <ul>
            {rows.slice(0, showAll ? undefined : PAGE).map(({ g, o }) => {
              const opp = o.side === 'black' ? g.white : g.black
              const oppRating = o.side === 'black' ? g.white_rating : g.black_rating
              const acc = g.summary && o.side ? g.summary.accuracy[o.side] : null
              const spark =
                g.summary && g.summary.spark.length > 1
                  ? o.side === 'black'
                    ? g.summary.spark.map((v) => 100 - v)
                    : g.summary.spark
                  : null
              return (
                <li key={g.id}>
                  <button className="gamerow" disabled={busy} onClick={() => open(g.pgn, loaded)}>
                    <span className="g-date">
                      {new Date(g.end_time * 1000).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="g-players">
                      <i className={`dot ${o.side ?? 'none'}`} aria-label={`You played ${o.side}`} />
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
                    <span className="g-time">{timeControl(g.time_control)}</span>
                    <span className={`g-action${g.reviewed ? ' done' : ''}`}>
                      {g.reviewed ? 'Open' : 'Review'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!showAll && rows.length > PAGE && (
            <button className="ghost more" onClick={() => setShowAll(true)}>
              Show all {rows.length} games
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
        <button className="primary" disabled={busy || !pgn.trim()} onClick={() => open(pgn, null)}>
          Review PGN
        </button>
      </details>
    </div>
  )
}
