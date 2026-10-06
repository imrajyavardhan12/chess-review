import { expect, test, type Browser, type Page } from '@playwright/test'

const GAME = `[White "Morphy"]
[Black "Duke of Brunswick"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`

async function review(page: Page) {
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(GAME)
  await page.getByRole('button', { name: 'Review PGN' }).click()
}

const accuracies = async (page: Page) => {
  await expect(page.locator('.review')).toBeVisible()
  return page.locator('.acc-num').allTextContents()
}

/** A fresh browser context (its own IndexedDB), so nothing is reused from an earlier review. */
async function freshPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  return { context, page: await context.newPage() }
}

test('a single-core device with a slow CPU gets one worker and an estimate of the time left', async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { value: 1 }))
  const workers: string[] = []
  page.on('worker', (w) => workers.push(w.url()))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await review(page)
  await expect(page.getByRole('status')).toContainText(/Estimating the time left|left\./)
  await expect(page.getByRole('status')).toContainText(/(seconds|minutes?) left\./)
  await expect(page.locator('.review')).toBeVisible()
  expect(workers.filter((u) => u.includes('/engine/'))).toHaveLength(1)
})

test('a worker that crashes mid-analysis is replaced, and the review comes out the same', async ({
  browser,
}) => {
  const normal = await freshPage(browser)
  await review(normal.page)
  const expected = await accuracies(normal.page)
  await normal.context.close()

  const crashing = await freshPage(browser)
  const page = crashing.page
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(e.message))
  // The first engine worker dies (as if out of memory) on its fifth search.
  await page.addInitScript(() => {
    const send = Object.getOwnPropertyDescriptor(Worker.prototype, 'postMessage')!.value as (
      this: Worker,
      ...args: unknown[]
    ) => void
    const searches = new WeakMap<Worker, number>()
    let crashed = false
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]) {
      const n = (searches.get(this) ?? 0) + (typeof message === 'string' && message.startsWith('go ') ? 1 : 0)
      searches.set(this, n)
      if (!crashed && n === 5) {
        crashed = true
        this.terminate()
        setTimeout(() => {
          this.onerror?.(new ErrorEvent('error', { message: 'simulated crash' }))
        })
        return
      }
      send.apply(this, [message, ...rest])
    }
    ;(window as unknown as { crashed: () => boolean }).crashed = () => crashed
  })
  await review(page)
  expect(await accuracies(page)).toEqual(expected)
  expect(await page.evaluate(() => (window as unknown as { crashed: () => boolean }).crashed())).toBe(true)
  expect(problems).toEqual([])
  await crashing.context.close()
})
