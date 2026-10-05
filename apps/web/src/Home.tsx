import { InvalidPgnError, ReviewFileError, importJson, type PresetName } from '@chessreview/core'
import { useState } from 'react'
import { openReview } from './App'
import { useAsync, useQueue } from './hooks'
import { usePrefs } from './prefs'
import { Settings } from './Settings'
import {
  ChessComError,
  LichessError,
  engineIdFor,
  fetchLichessGames,
  fetchMonth,
  getReviewService,
  listMonths,
  type RemoteGame,
  type Summary,
} from './services'

type Source = 'chesscom' | 'lichess'
const STORE = 'chessreview.user'
const SOURCE = 'chessreview.source'
const PAGE = 25
const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: skip remembering */
  }
}
const remembered = () => read(STORE)
const rememberedSource = (): Source => (read(SOURCE) === 'lichess' ? 'lichess' : 'chesscom')
const SITE: Record<Source, string> = { chesscom: 'chess.com', lichess: 'Lichess' }

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
  e instanceof ChessComError || e instanceof LichessError || e instanceof ReviewFileError
    ? e.message
    : e instanceof InvalidPgnError
      ? `That PGN couldn’t be read: ${e.message}`
      : e instanceof Error
        ? e.message
        : 'Something went wrong.'

interface Query {
  source: Source
  user: string
  /** chess.com: the month shown. */
  month?: string
  /** Lichess: how many of the most recent games to list. */
  count?: number
}

interface GamesData {
  user: string
  months: string[]
  month: string | null
  rows: Row[]
}

async function loadGames(q: Query, preset: PresetName, engineId: string): Promise<GamesData> {
  let months: string[] = []
  let month: string | null = null
  let games: RemoteGame[]
  if (q.source === 'lichess') {
    games = await fetchLichessGames(q.user, q.count ?? 30)
  } else {
    months = await listMonths(q.user)
    month = q.month ?? months[0] ?? null
    games = month ? await fetchMonth(q.user, month) : []
  }
  const service = await getReviewService()
  const ids = await Promise.all(games.map((g) => service.idFor(g.pgn, preset, engineId)))
  const summaries = await service.summaries(ids)
  const rows = games.map((game, i) => ({ game, id: ids[i]!, summary: summaries.get(ids[i]!) ?? null }))
  return { user: q.user, months, month, rows }
}

/** What a game's row says while it waits in, or goes through, the review queue. */
function actionFor(job: { done: number; total: number; place: number } | undefined): string {
  if (!job) return 'Review'
  return job.total ? `${Math.round((job.done / job.total) * 100)}%` : 'Queued'
}

/** The batch in progress: how far it is, and a way to stop it. */
function QueueBar({
  active,
  onCancel,
}: {
  active: Array<{ id: string; state: { done: number; total: number } }>
  onCancel: () => void
}) {
  if (active.length === 0) return null
  const current = active.find((a) => a.state.total > 0) ?? active[0]!
  const pct = current.state.total ? (current.state.done / current.state.total) * 100 : 0
  return (
    <div className="queuebar" role="status">
      <p>
        Reviewing {active.length === 1 ? '1 game' : `${active.length} games`}, one at a time
        {current.state.total ? `: ${Math.round(pct)}% through the current one` : ''}. You can leave this page;
        they carry on, and pick up again after a reload.
      </p>
      <div className="bar">
        <div style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <button className="ghost" onClick={onCancel}>
        Cancel all
      </button>
    </div>
  )
}

export function Home() {
  const { preset, engine } = usePrefs()
  const engineId = engineIdFor(engine)
  const [name, setName] = useState(remembered)
  const [source, setSource] = useState<Source>(rememberedSource)
  const [query, setQuery] = useState<Query | null>(() =>
    remembered() ? { source: rememberedSource(), user: remembered() } : null,
  )
  const queue = useQueue()
  const queued = new Map(queue.active.map((a, i) => [a.id, { ...a.state, place: i }]))
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')
  const [pgn, setPgn] = useState('')
  const [showAll, setShowAll] = useState(false)

  // Re-runs when the source, user, month, preset or engine changes (the preset and engine decide which
  // games count as reviewed), and when a review finishes, so finished games show as reviewed.
  const games = useAsync(
    query
      ? `${query.source}|${query.user}|${query.month ?? ''}|${query.count ?? ''}|${preset}|${engineId}|${queue.completed}`
      : null,
    () => loadGames(query!, preset, engineId),
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
    setQuery({ source, user, month: wanted })
    write(STORE, user)
    write(SOURCE, source)
  }

  async function reviewAll(pgns: string[]) {
    setOpenError('')
    try {
      await (await getReviewService()).startMany(pgns, preset, engineId)
    } catch (e) {
      setOpenError(messageOf(e))
    }
  }

  async function importFile(file: File) {
    setOpenError('')
    try {
      const { id, pgn, review } = await importJson(await file.text())
      const service = await getReviewService()
      await service.importReview(id, pgn, review)
      openReview(id, null)
    } catch (e) {
      setOpenError(messageOf(e))
    }
  }

  async function open(pgnText: string, me: string | null) {
    setOpening(true)
    setOpenError('')
    try {
      const id = await (await getReviewService()).start(pgnText, preset, engineId)
      openReview(id, me)
    } catch (e) {
      setOpenError(messageOf(e))
      setOpening(false)
    }
  }

  const view = (rows ?? []).map((r) => ({ ...r, o: outcome(r.game, loaded) }))
  const fresh = view.filter((r) => !r.summary && !queued.has(r.id)).map((r) => r.game.pgn)
  const tally = (tone: string) => view.filter((r) => r.o.tone === tone).length
  const record = view.some((r) => r.o.side)
    ? `${tally('won')} won, ${tally('lost')} lost, ${tally('draw')} drawn`
    : ''

  return (
    <div className="home">
      <header className="homebar">
        <span className="wordmark">chessreview</span>
        <a href="#/insights" className="navlink">
          Insights
        </a>
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
        <fieldset className="source">
          <legend>Games from</legend>
          {(['chesscom', 'lichess'] as const).map((s) => (
            <label key={s}>
              <input type="radio" name="source" checked={source === s} onChange={() => setSource(s)} />
              {SITE[s]}
            </label>
          ))}
        </fieldset>
        <label htmlFor="user">{SITE[source]} username</label>
        <div className="userform-row">
          <input
            id="user"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={source === 'lichess' ? 'e.g. DrNykterstein' : 'e.g. hikaru'}
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

      <QueueBar active={queue.active} onCancel={() => void getReviewService().then((s) => s.cancelAll())} />

      {rows && (
        <section className="games" aria-label="Games">
          <div className="games-head">
            <div>
              <h2>{loaded}</h2>
              {record && (
                <p className="muted">
                  {record} {query?.source === 'lichess' ? 'in these games' : 'this month'}
                </p>
              )}
            </div>
            {query?.source !== 'lichess' && (
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
            )}
          </div>
          {fresh.length > 0 && (
            <button className="secondary reviewall" disabled={busy} onClick={() => void reviewAll(fresh)}>
              Review all {fresh.length} new game{fresh.length === 1 ? '' : 's'}
            </button>
          )}
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
                    <span className="g-time">{timeControl(g.timeControl)}</span>
                    <span className={`g-action${summary ? ' done' : ''}`}>
                      {summary ? 'Open' : actionFor(queued.get(id))}
                    </span>
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
          {query?.source === 'lichess' && view.length >= (query.count ?? 30) && (
            <button
              className="ghost more"
              disabled={busy}
              onClick={() => setQuery({ ...query, count: (query.count ?? 30) + 30 })}
            >
              Load older games
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

      <details className="paste">
        <summary>Open a review file</summary>
        <p className="muted">
          A review downloaded from chessreview (the .json file from a review’s Report tab).
        </p>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Review file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importFile(file)
            e.target.value = ''
          }}
        />
      </details>
    </div>
  )
}
