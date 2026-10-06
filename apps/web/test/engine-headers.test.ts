import { describe, expect, it } from 'vitest'
import { withEngineOrigin } from '../../../scripts/engine-headers.mjs'

const HEADERS = `/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.chess.com; object-src 'none'
  X-Content-Type-Options: nosniff
`

describe('the CSP for the optional full engine', () => {
  it('is unchanged when no full engine is configured', () => {
    expect(withEngineOrigin(HEADERS, undefined)).toBe(HEADERS)
    expect(withEngineOrigin(HEADERS, '')).toBe(HEADERS)
  })

  it('allows only the download origin, plus blob: for the verified copy', () => {
    const out = withEngineOrigin(HEADERS, 'https://engines.example.com/sf/stockfish-19-single.wasm?v=1')
    expect(out).toContain(
      "connect-src 'self' https://api.chess.com https://engines.example.com blob:; object-src 'none'",
    )
    expect(out.replace(' https://engines.example.com blob:', '')).toBe(HEADERS)
  })

  it('refuses a plain-http download location, except on this machine for tests', () => {
    expect(() => withEngineOrigin(HEADERS, 'http://engines.example.com/sf.wasm')).toThrow(/https/)
    expect(withEngineOrigin(HEADERS, 'http://127.0.0.1:4174/sf.wasm')).toContain(
      'http://127.0.0.1:4174 blob:',
    )
  })
})
