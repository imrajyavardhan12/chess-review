import { defineConfig, devices } from '@playwright/test'

// Runs against the production build served with the real _headers (see scripts/serve-dist.mjs),
// so the tests exercise the same Content-Security-Policy as the deployed site.
// Build first: `pnpm build`. The `full-engine` project uses a second build configured with an
// optional full engine served from another local origin (scripts/build-engine-fixture.mjs).
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 90_000 },
  fullyParallel: false, // one analysis at a time keeps timings honest on small CI machines
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
    // Requests answered by the offline service worker bypass page.route mocks; e2e/offline.spec.ts opts in.
    serviceWorkers: 'block',
    // Some sandboxes route localhost through a system proxy, which stalls the first request.
    launchOptions: { args: ['--no-proxy-server'] },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'full-engine.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' },
    },
    {
      name: 'full-engine',
      testMatch: 'full-engine.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4175' },
    },
  ],
  webServer: [
    {
      command: 'node ../../scripts/serve-dist.mjs',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node ../../scripts/serve-dist.mjs',
      env: { DIST: 'dist-full-engine', PORT: '4175' },
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node ../../scripts/serve-engine-fixture.mjs',
      url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
