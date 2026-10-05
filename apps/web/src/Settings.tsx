import type { PresetName } from '@chessreview/core'
import { BOARDS, setPrefs, usePrefs, type BoardTheme, type Theme } from './prefs'

export function Settings() {
  const { theme, board, preset } = usePrefs()
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
    </div>
  )
}
