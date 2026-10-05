import type { PresetName } from '@chessreview/core'
import { useState } from 'react'
import { EngineDialog } from './EngineDialog'
import { useAsync } from './hooks'
import { BOARDS, setPrefs, usePrefs, type BoardTheme, type Theme } from './prefs'
import { fullEngine } from './services'

export function Settings() {
  const { theme, board, preset, engine } = usePrefs()
  const [dialog, setDialog] = useState(false)
  // Bumped after a download or removal, so whether the engine is installed is asked again.
  const [changes, setChanges] = useState(0)
  const installed =
    useAsync(fullEngine ? `installed|${changes}` : null, () => fullEngine!.installed()).value ?? false
  return (
    <div className="settings">
      <label>
        Theme
        <select value={theme} onChange={(e) => setPrefs({ theme: e.target.value as Theme })}>
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label title="How much work the engine does per position. Deeper is steadier but slower.">
        Analysis
        <select value={preset} onChange={(e) => setPrefs({ preset: e.target.value as PresetName })}>
          <option value="quick">Quick</option>
          <option value="standard">Standard</option>
          <option value="deep">Deep</option>
        </select>
      </label>
      {fullEngine && (
        <label title="Standard ships with the site. Accurate is full Stockfish 19, a one-time download.">
          Engine
          <select
            value={engine === 'accurate' && installed ? 'accurate' : 'standard'}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'standard') setPrefs({ engine: 'standard' })
              else if (v === 'accurate' && installed) setPrefs({ engine: 'accurate' })
              else setDialog(true) // not downloaded yet, or "manage"
            }}
          >
            <option value="standard">Standard</option>
            <option value="accurate">
              Accurate{installed ? '' : ` (${Math.round(fullEngine.manifest.bytes / 1_000_000)} MB)`}
            </option>
            {installed && <option value="manage">Manage download…</option>}
          </select>
        </label>
      )}
      <label>
        Board
        <select value={board} onChange={(e) => setPrefs({ board: e.target.value as BoardTheme })}>
          {Object.entries(BOARDS).map(([id, b]) => (
            <option key={id} value={id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {dialog && (
        <EngineDialog
          installed={installed}
          onClose={() => setDialog(false)}
          onChanged={() => setChanges((n) => n + 1)}
        />
      )}
    </div>
  )
}
