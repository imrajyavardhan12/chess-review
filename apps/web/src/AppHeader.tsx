import { BrandMark } from './icons'
import { Settings } from './Settings'

export type NavKey = 'games' | 'insights' | 'train'

/** The bar at the top of every page: brand, where you can go, and the settings. */
export function AppHeader({ active }: { active?: NavKey }) {
  return (
    <header className="appbar">
      <a href="#/" className="brand">
        <BrandMark />
        <span className="brand-name">chessreview</span>
      </a>
      <nav className="mainnav" aria-label="Main">
        <a href="#/" aria-current={active === 'games' ? 'page' : undefined}>
          Games
        </a>
        <a href="#/insights" aria-current={active === 'insights' ? 'page' : undefined}>
          Insights
        </a>
        <a href="#/train" aria-current={active === 'train' ? 'page' : undefined}>
          Train
        </a>
      </nav>
      <div className="appbar-end">
        <Settings />
      </div>
    </header>
  )
}
