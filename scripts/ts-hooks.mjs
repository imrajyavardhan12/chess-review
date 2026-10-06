// Lets Node run the workspace's TypeScript sources directly (`node --import ./scripts/ts-hooks.mjs x.ts`):
// relative imports in the sources have no extension, so try `.ts` and `/index.ts`.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (e) {
      if (!specifier.startsWith('.')) throw e
      for (const ext of ['.ts', '/index.ts']) {
        try {
          return next(specifier + ext, context)
        } catch {
          /* try the next candidate */
        }
      }
      throw e
    }
  },
})
