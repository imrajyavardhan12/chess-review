# ADR 0007: Offline use, low-end devices and accessibility

Status: accepted (workstream 7)

## Context

The app does all its work on the device, so it should keep working when the device is offline,
slow, short of memory, or used without a mouse or screen. Before this change a dead worker was
replaced but the pool kept its size, the progress screen showed only a step count, the board was
invisible to screen readers, and nothing worked without a network.

## Decision

1. **A hand-written service worker, generated per build.** `apps/web/sw/service-worker.js` is
   plain JavaScript; `scripts/precache.mjs` (a Vite `closeBundle` hook) prepends the list of built
   files and a version hashed from their contents and `_headers`. Install caches the whole build
   (app shell, fonts, opening data, the lite engine: 14 files, 1.5 MB over the wire) in
   `chessreview-shell-<version>`.
2. **Updates never swap files under an open tab.** A new version installs in the background and
   waits. The app shows "A new version of chessreview is ready. Reload"; the click tells it to take
   over and reloads. Activation deletes only older `chessreview-shell-*` caches (the full engine's
   cache from workstream 3 is untouched). Pages are network-first, so an online visit always sees
   the newest deploy; everything else is cache-first, which is safe because the files are
   immutable within one version. Other origins (chess.com) are never intercepted.
3. **The pool shrinks after a crash.** A worker dying is most often the browser reclaiming memory,
   so `EnginePool` replaces it and runs with one engine fewer (never below one). The starting size
   also respects `navigator.deviceMemory`: engines (about 130 MB each) stay within a quarter of the
   reported memory, so 1 GB devices get one worker and 2 GB devices three.
4. **An honest time estimate.** The service measures the rate from the first finished step (so the
   engine's start-up is not extrapolated), waits for six steps and 1.5 s before saying anything,
   and rounds ("About 15 seconds left").
5. **Accessibility is tested, not assumed.** axe (WCAG 2.1 A/AA) runs in e2e on the home page, the
   games list, the PGN box, the progress screen, the review (start, a move, the report) and the
   error screen, in both themes. The board is an image with a text description of the position;
   the interactive board inside it is `inert` because every move is also reachable from the move
   list and the arrow keys. The eval graph has a text summary. The Moves/Report tabs follow the
   ARIA tab pattern. Piece animation honours `prefers-reduced-motion`.

## Alternatives considered

- **Workbox / vite-plugin-pwa.** Would do the same with a dependency and a generated worker that is
  harder to audit; the worker here is 43 lines.
- **`skipWaiting()` on install.** Simpler, but a lazily loaded chunk of the old version could then
  vanish from under an open tab.
- **Measuring memory pressure directly.** `performance.measureUserAgentSpecificMemory` needs
  cross-origin isolation, which the app does not use; a crash is the signal every browser gives.
- **Keyboard access to the board itself.** react-chessboard has no keyboard model. Making the
  board's squares focusable would add 64 tab stops; the move list and arrow keys already cover
  navigation, and the analysis board (workstream 2) adds click-to-move.

## Consequences

- A first visit downloads the whole build (about 1.5 MB compressed) in the background.
- Hosts must serve `sw.js` from the site root (or the `BASE_PATH`); `_headers` marks it
  `no-cache`. Without a service worker (private windows, blocked) the app works as before.
- e2e tests block service workers by default, because requests a service worker answers bypass
  Playwright's request mocks; `e2e/offline.spec.ts` opts in.
- Firefox and WebKit are not in the e2e matrix yet: their browser builds could not be downloaded in
  the environment this was written in. The code uses only APIs both support.
