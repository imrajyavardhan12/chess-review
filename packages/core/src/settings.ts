import { ANALYSIS_VERSION } from './rules'
import type { ReviewSettings } from './types'

/** Analysis presets. More nodes means a slower, steadier review; results are deterministic per preset. */
export const PRESETS = {
  quick: { depth: 14, nodes: 400_000 },
  standard: { depth: 16, nodes: 1_500_000 },
  deep: { depth: 20, nodes: 6_000_000 },
} as const
export type PresetName = keyof typeof PRESETS

export const HASH_MB = 16

export function settingsFor(preset: PresetName, engine: string): ReviewSettings {
  return { ...PRESETS[preset], hashMb: HASH_MB, engine }
}

/**
 * Stable id for a review: same game + same settings + same rules = same id, so a stored review
 * can be found again and a changed rule set never serves stale results.
 */
export async function reviewKey(pgn: string, s: ReviewSettings): Promise<string> {
  const text = [pgn.trim(), s.depth, s.nodes, s.hashMb, s.engine, `v${ANALYSIS_VERSION}`].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
