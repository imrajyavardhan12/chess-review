import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { withEngineOrigin } from '../../scripts/engine-headers.mjs'

/** Lets the CSP allow the optional full engine's download location, when one is configured. */
function engineCsp(url: string | undefined): Plugin {
  return {
    name: 'engine-csp',
    apply: 'build',
    writeBundle({ dir }) {
      const file = join(dir!, '_headers')
      writeFileSync(file, withEngineOrigin(readFileSync(file, 'utf8'), url))
    },
  }
}

// BASE_PATH lets the same build serve from a sub-path (e.g. GitHub Pages project sites).
// VITE_FULL_ENGINE_URL, _BYTES and _SHA256 offer the optional full engine (docs/DEPLOY.md).
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return {
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), engineCsp(env.VITE_FULL_ENGINE_URL)],
    build: { target: 'es2022' },
  }
})
