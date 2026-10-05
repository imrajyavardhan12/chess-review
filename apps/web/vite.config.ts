import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// BASE_PATH lets the same build serve from a sub-path (e.g. GitHub Pages project sites).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: { target: 'es2022' },
})
