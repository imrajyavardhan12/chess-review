import { useSyncExternalStore } from 'react'

// Registers the offline service worker (apps/web/sw/) in production builds, and tells the page
// when a new version has been downloaded so the user can switch to it. Nothing is swapped without
// that click: an open review keeps the files it started with.

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

function offer(worker: ServiceWorker) {
  // With no controller this is the first install, not an update: there is nothing to reload into.
  if (!navigator.serviceWorker.controller) return
  waiting = worker
  for (const l of listeners) l()
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(
      // Some environments (e.g. test browsers that block service workers) resolve with nothing.
      (reg: ServiceWorkerRegistration | undefined) => {
        if (!reg) return
        if (reg.waiting) offer(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const next = reg.installing
          next?.addEventListener('statechange', () => next.state === 'installed' && offer(next))
        })
        // The app never navigates (routes live in the hash), so look for a new deploy now and then.
        setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000)
      },
      // Offline support is an extra: the app works the same without it (e.g. in private windows).
      () => undefined,
    )
  })
}

/** True once a new version is ready to take over. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => waiting !== null,
  )
}

/** Switches to the waiting version and reloads into it. */
export function applyUpdate(): void {
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  waiting?.postMessage('skip-waiting')
}
