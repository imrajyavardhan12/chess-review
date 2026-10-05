# Deploying

The build output (`apps/web/dist`) is a static site. Nothing runs on a server.

## Cloudflare Pages (recommended)

Free, unlimited bandwidth, applies `_headers`, and no card is needed.

**From the command line**

    pnpm install --frozen-lockfile
    pnpm build
    pnpm dlx wrangler login          # once
    pnpm dlx wrangler pages deploy   # reads wrangler.jsonc

**From Git (Cloudflare dashboard)**: connect the repository, then set

- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Build output directory: `apps/web/dist`
- Node version: 22 (`NODE_VERSION=22`); Pages detects pnpm from `pnpm-lock.yaml`. If the image's pnpm
  is older than the `packageManager` pin, set `PNPM_VERSION` to match it.

Pages serves `index.html` for unknown paths, which this single-page app relies on, and applies the
security and caching headers in `apps/web/public/_headers`.

Limits to know (check Cloudflare’s current documentation): 25 MiB per file (the largest asset is the 1.8 MB engine) and 20,000 files.

## Offering the accurate (full-strength) engine

The site ships Stockfish 19 _lite_. A deployment can also offer the full engine, which reproduces
native Stockfish exactly, as an opt-in download. Its `.wasm` is 99 MB, over the Pages limit of 25 MiB
per file, so host it elsewhere and point the build at it. Nothing is downloaded unless a user picks
"Accurate" in Settings and confirms.

1. **Get the file and its fingerprint.** After `pnpm install` it is in the `stockfish` package:

       F=node_modules/.pnpm/stockfish@19.0.0/node_modules/stockfish/bin/stockfish-19-single.wasm
       wc -c < "$F"            # bytes
       shasum -a 256 "$F"      # SHA-256

2. **Host it on Cloudflare R2** (or any HTTPS file host that sends CORS headers):

       pnpm dlx wrangler r2 bucket create chessreview-engine
       pnpm dlx wrangler r2 object put chessreview-engine/stockfish-19-single.wasm \
         --file "$F" --content-type application/wasm --remote

   Make the bucket readable: connect a custom domain (recommended, e.g. `engine.example.com`) or
   enable its `r2.dev` URL. Add a CORS policy that allows `GET` from the site's origin:

       [{ "AllowedOrigins": ["https://your-site.pages.dev"], "AllowedMethods": ["GET"] }]

   R2 does not charge for egress; storage of one 99 MB file is well inside the free tier.

3. **Configure the build** with the file's URL, size and SHA-256 (in the Pages project's environment
   variables, or a `.env` file in `apps/web` for a local build):

       VITE_FULL_ENGINE_URL=https://engine.example.com/stockfish-19-single.wasm
       VITE_FULL_ENGINE_BYTES=99102793
       VITE_FULL_ENGINE_SHA256=<the hash from step 1>

   The build adds exactly that origin, and `blob:` (the verified copy is handed to the engine workers
   as a blob URL), to `connect-src` in `dist/_headers`; nothing else in the policy changes. Without
   these variables the build offers no engine choice and the policy is untouched. The URL must be
   HTTPS.

4. **Check it:** open the site, choose Settings → Engine → Accurate, download, and review a game.
   The Report tab names the engine that made each review.

If the file is replaced, update the size and hash: a download that does not match is refused, and
browsers that already have the old copy keep using it until the hash changes.

## Any other static host

Upload `apps/web/dist`. The host must:

- serve `.wasm` as `application/wasm`;
- fall back to `index.html` for unknown paths (or the app can be served from a sub-path: build with
  `BASE_PATH=/repo-name/ pnpm build`);
- ideally apply the headers in `_headers`. Without them the app still works; you lose the CSP.

GitHub Pages cannot set custom headers, so it works but runs without the Content-Security-Policy.

## Before every release

    pnpm check          # types, lint, formatting, unit and integration tests
    pnpm e2e            # builds, then drives the production build in a real browser under the CSP

## Checking a deployment

Open the site, review a game (the paste box on the home page is enough), and confirm in the browser console
that there are no errors. Reviews are stored in the visitor's browser, so there is nothing to migrate.
