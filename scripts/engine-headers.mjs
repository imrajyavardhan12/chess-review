// Adds the optional full engine's download origin to the Content-Security-Policy in _headers.
// The engine workers load the verified file from a blob: URL, so blob: is allowed for connect-src
// too, and only when a full engine is configured. Without one, _headers is left exactly as it is.

/** @param {string} headers the text of a Cloudflare `_headers` file @param {string | undefined} url */
export function withEngineOrigin(headers, url) {
  if (!url) return headers
  const { origin, protocol } = new URL(url)
  if (protocol !== 'https:' && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    throw new Error(`the full engine must be served over https, not ${origin}`)
  }
  let changed = false
  const out = headers.replace(/(Content-Security-Policy:[^\n]*connect-src)([^;\n]*)/, (_, head, sources) => {
    changed = true
    return `${head}${sources} ${origin} blob:`
  })
  if (!changed) throw new Error('no connect-src in _headers to extend')
  return out
}
