import { PRESETS, type PresetName } from '@chessreview/core'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { EngineDialog } from './EngineDialog'
import { useAsync } from './hooks'
import { GearIcon } from './icons'
import { BOARDS, setPrefs, usePrefs, type BoardTheme, type Theme } from './prefs'
import { Segmented } from './Segmented'
import { fullEngine } from './services'

const PRESET_COPY: Record<PresetName, string> = {
  quick: 'The fastest look. Fine for a first pass.',
  standard: 'Recommended: a good balance of speed and steady labels.',
  deep: `About ${Math.round(PRESETS.deep.nodes / PRESETS.standard.nodes)} times slower than Standard, for steadier labels near the boundaries.`,
}

/** Closes a popover on Escape (returning focus to its button) or a press outside it. */
function useDismiss(
  open: boolean,
  container: React.RefObject<HTMLElement | null>,
  button: React.RefObject<HTMLElement | null>,
  close: () => void,
) {
  const onClose = useEffectEvent(close)
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onClose()
      button.current?.focus()
    }
    const press = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', press)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', press)
    }
  }, [open, container, button])
}

export function Settings() {
  const { theme, board, preset, engine } = usePrefs()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(false)
  // Bumped after a download or removal, so whether the engine is installed is asked again.
  const [changes, setChanges] = useState(0)
  const installed =
    useAsync(fullEngine ? `installed|${changes}` : null, () => fullEngine!.installed()).value ?? false
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useId()
  useDismiss(open, root, button, () => setOpen(false))

  const accurate = engine === 'accurate' && installed
  const megabytes = fullEngine ? Math.round(fullEngine.manifest.bytes / 1_000_000) : 0

  return (
    <div ref={root} className="settings">
      <button
        ref={button}
        className="iconbtn"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <GearIcon />
      </button>

      {open && (
        <div id={panel} className="popover" role="dialog" aria-label="Settings">
          <section>
            <h3>Theme</h3>
            <Segmented<Theme>
              label="Theme"
              value={theme}
              onChange={(v) => setPrefs({ theme: v })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </section>

          <section>
            <h3>Analysis depth</h3>
            <Segmented<PresetName>
              label="Analysis"
              value={preset}
              onChange={(v) => setPrefs({ preset: v })}
              options={[
                { value: 'quick', label: 'Quick' },
                { value: 'standard', label: 'Standard' },
                { value: 'deep', label: 'Deep' },
              ]}
            />
            <p className="pop-hint">{PRESET_COPY[preset]}</p>
          </section>

          {fullEngine && (
            <section>
              <h3>Engine</h3>
              <Segmented<'standard' | 'accurate'>
                label="Engine"
                value={accurate ? 'accurate' : 'standard'}
                onChange={(v) => {
                  if (v === 'standard') setPrefs({ engine: 'standard' })
                  else if (installed) setPrefs({ engine: 'accurate' })
                  else setDialog(true) // not downloaded yet
                }}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'accurate', label: installed ? 'Accurate' : `Accurate (${megabytes} MB)` },
                ]}
              />
              <p className="pop-hint">
                Standard ships with the site. Accurate is full-strength Stockfish 19, a one-time download.{' '}
                {installed && (
                  <button className="link" onClick={() => setDialog(true)}>
                    Manage download
                  </button>
                )}
              </p>
            </section>
          )}

          <section>
            <h3>Board</h3>
            <div role="radiogroup" aria-label="Board" className="swatches">
              {(Object.entries(BOARDS) as Array<[BoardTheme, (typeof BOARDS)[BoardTheme]]>).map(([id, b]) => (
                <label key={id} className="swatch">
                  <input
                    type="radio"
                    name="board-theme"
                    value={id}
                    checked={board === id}
                    onChange={() => setPrefs({ board: id })}
                  />
                  <span
                    className="swatch-board"
                    style={{ '--l': b.light, '--d': b.dark } as React.CSSProperties}
                  />
                  <span className="swatch-name">{b.name}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      )}

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
