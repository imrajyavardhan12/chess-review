import { BOARDS, setPrefs, usePrefs, type BoardTheme, type Theme } from './prefs'

export function Settings() {
  const { theme, board } = usePrefs()
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
