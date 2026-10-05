# Deploying

The build output (`apps/web/dist`) is a static site. Nothing runs on a server.

## Cloudflare Pages (recommended)

Free, unlimited bandwidth, applies `_headers`, and no card is needed.

**From the command line**

    npm ci
    npm run build
    npx wrangler login          # once
    npx wrangler pages deploy   # reads wrangler.jsonc

**From Git (Cloudflare dashboard)**: connect the repository, then set

- Build command: `npm ci && npm run build`
- Build output directory: `apps/web/dist`
- Node version: 22 (`NODE_VERSION=22`)

Pages serves `index.html` for unknown paths, which this single-page app relies on, and applies the
security and caching headers in `apps/web/public/_headers`.

Limits to know (check Cloudflare’s current documentation): 25 MiB per file (the largest asset is the 1.8 MB engine) and 20,000 files.

## Any other static host

Upload `apps/web/dist`. The host must:

- serve `.wasm` as `application/wasm`;
- fall back to `index.html` for unknown paths (or the app can be served from a sub-path: build with
  `BASE_PATH=/repo-name/ npm run build`);
- ideally apply the headers in `_headers`. Without them the app still works; you lose the CSP.

GitHub Pages cannot set custom headers, so it works but runs without the Content-Security-Policy.

## Before every release

    npm run check       # types, lint, formatting, unit and integration tests
    npm run e2e         # builds, then drives the production build in a real browser under the CSP

## Checking a deployment

Open the site, review a game (the paste box on the home page is enough), and confirm in the browser console
that there are no errors. Reviews are stored in the visitor's browser, so there is nothing to migrate.
