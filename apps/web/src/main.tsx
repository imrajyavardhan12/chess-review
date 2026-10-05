import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/geist'
import './prefs'
import './styles.css'
import { App } from './App'
import { getPrefs, setPrefs } from './prefs'
import { fullEngine } from './services'

// The browser may have cleared the downloaded engine: fall back to the standard one rather than fail.
if (getPrefs().engine === 'accurate') {
  void (fullEngine?.installed() ?? Promise.resolve(false)).then(
    (ok) => ok || setPrefs({ engine: 'standard' }),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
