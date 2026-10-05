import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { writeServiceWorker } from '../../scripts/precache.mjs'

/** Adds the offline service worker (apps/web/sw/) to a production build, once every file is written. */
function serviceWorker(): Plugin {
  let outDir = ''
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved: (config) => void (outDir = resolve(config.root, config.build.outDir)),
    closeBundle: () => void writeServiceWorker(outDir),
  }
}

// BASE_PATH lets the same build serve from a sub-path (e.g. GitHub Pages project sites).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), serviceWorker()],
  build: { target: 'es2022' },
})
