# ADR 0003: The full-strength engine as a verified, opt-in download

Status: accepted (workstream 3)

## Context

The shipped Stockfish 19 _lite_ engine has a floor of about 1.5–2% win-chance error against native
Stockfish (`docs/ARCHITECTURE.md`, decision 8). The full network removes it, but its `.wasm` is 99 MB:
too big for Cloudflare Pages (25 MiB per file) and too big to make every visitor download.

## Decision

- **A manifest, set at build time.** `VITE_FULL_ENGINE_URL`, `VITE_FULL_ENGINE_BYTES` and
  `VITE_FULL_ENGINE_SHA256` describe a copy hosted elsewhere (R2 is documented). Without them the
  site offers no choice and behaves exactly as before.
- **The CSP follows the manifest.** A build step adds only the manifest's origin, and `blob:`, to
  `connect-src` in `_headers`. Plain HTTP is refused except for `127.0.0.1`/`localhost` (tests).
- **Verified, then kept.** The app streams the file with progress, rejects a wrong size or SHA-256
  without keeping anything, and stores it in Cache Storage keyed by its hash. Workers load it as a
  `blob:` URL through the loader's `#<wasm url>` convention; the 21 KB loader ships with the site.
- **Separate reviews.** The engine id is part of the review id, the pending request records the
  engine it asked for, and a missing download is reported with a way out (download, or switch to
  Standard) instead of a generic engine error. If the browser evicts the file, the preference falls
  back to Standard at start-up.
- **Bounded memory.** At most two full-engine workers (about 500 MB each), one on devices reporting
  4 GB or less.

## Alternatives considered

- **Ship the full engine on Pages.** Impossible within the 25 MiB file limit; splitting the wasm
  would need a custom loader.
- **Let the worker fetch the hosted file directly.** No integrity check and no control over storage;
  the HTTP cache may evict it at any time.
- **Serve the cached file through a service worker.** Would avoid `blob:` in the CSP, but makes the
  engine depend on the offline work (workstream 7) and on the service worker being active.
- **A runtime manifest file.** Editable without a rebuild, but the CSP is fixed at build time anyway,
  so one build-time setting keeps the two in step.

## Evidence

- Unit tests: manifest parsing, download with progress, checksum and size rejection, removal, a
  browser without Cache Storage, worker counts, the CSP change and its refusal of plain HTTP.
- End-to-end (`apps/web/e2e/full-engine.spec.ts`), against a second build configured for a fixture
  server on another origin: download, verification, Cache Storage, a review made with the full engine
  (named in the Report tab), a tampered file refused, the standard build's CSP and settings unchanged,
  and no CSP violation throughout.
- Node, one position, 1.5M nodes: lite 479 knps and 127 MB; full 255 knps and 507 MB.

## Consequences

- One extra dependency-free build step and three optional environment variables.
- `blob:` in `connect-src`, only on deployments that offer the full engine.
