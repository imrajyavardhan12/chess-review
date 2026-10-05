import { useSyncExternalStore } from 'react'
import { PRESETS, type PresetName } from '@chessreview/core'

export type Theme = 'auto' | 'light' | 'dark'
export type BoardTheme = 'slate' | 'green' | 'brown'

export const BOARDS: Record<
  BoardTheme,
  { name: string; light: string; dark: string; hlLight: string; hlDark: string }
> = {
  slate: { name: 'Slate', light: '#DCE4E8', dark: '#6F8A9C', hlLight: '#EBDD9B', hlDark: '#C7B25A' },
  green: { name: 'Green', light: '#EEEED2', dark: '#769656', hlLight: '#F5F682', hlDark: '#BACA2B' },
  brown: { name: 'Brown', light: '#F0D9B5', dark: '#B58863', hlLight: '#F7EC74', hlDark: '#DAC34B' },
}

export type EngineChoice = 'standard' | 'accurate'

export interface Prefs {
  theme: Theme
  board: BoardTheme
  /** How hard the engine works on each position. Part of a review's id. */
  preset: PresetName
  /** Which engine build reviews use. Part of a review's id. */
  engine: EngineChoice
}

const KEY = 'chessreview.prefs'

const THEMES: readonly Theme[] = ['auto', 'light', 'dark']

/** Picks `value` if it is one of the allowed options, else the fallback. Stored data is untrusted. */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback
}

function load(): Prefs {
  const fallback: Prefs = { theme: 'auto', board: 'slate', preset: 'standard', engine: 'standard' }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    return {
      theme: pick(o.theme, THEMES, fallback.theme),
      board: pick(o.board, Object.keys(BOARDS) as BoardTheme[], fallback.board),
      preset: pick(o.preset, Object.keys(PRESETS) as PresetName[], fallback.preset),
      engine: pick(o.engine, ['standard', 'accurate'] as const, fallback.engine),
    }
  } catch {
    return fallback
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

let state = load()
applyTheme(state.theme) // runs at import time, before first paint
const listeners = new Set<() => void>()

export function setPrefs(patch: Partial<Prefs>) {
  state = { ...state, ...patch }
  applyTheme(state.theme)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode: preference lasts for this tab only */
  }
  listeners.forEach((l) => l())
}

export const getPrefs = (): Prefs => state

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
