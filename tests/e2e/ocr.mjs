import { BASE, CHROME, mode, pickTool } from './kw.mjs'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import * as mupdf from 'mupdf'
const S = process.argv[2]
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const wait = (ms = 500) => page.waitForTimeout(ms)
const t0 = Date.now()
await page.goto(BASE)
await page.setInputFiles('input[type=file][accept="application/pdf,.pdf"]:not([multiple])', `${S}/scan.pdf`)
await page.waitForSelector('.toast', { timeout: 15000 })
console.log('notice:', await page.textContent('.toast'))
await page.click('.toast >> text=Run OCR')
await page.waitForSelector('dialog.modal')
await page.waitForFunction(() => /\(\d+\)/.test(document.querySelector('dialog .radio-row')?.textContent ?? ''))
console.log('dialog pages option:', (await page.textContent('dialog .radio-row')).trim().slice(0, 40), '| button:', await page.textContent('dialog .kw-btn--primary'))
await page.click('dialog .kw-btn--primary')
await page.waitForSelector('.ocr-progress', { timeout: 10000 })
await page.waitForSelector('.toast >> text=/Recognised|No text/', { timeout: 240000 })
console.log('result:', await page.textContent('.toast'), `(${Math.round((Date.now() - t0) / 1000)}s)`)
// search
await mode(page, 'Protect'); await page.click('.kw-tool[title="Find & redact"]'); await page.fill('[aria-label="Text to find"]', 'lazy dog'); await page.keyboard.press('Enter'); await wait(800)
console.log('find:', await page.textContent('.find-result'))
await page.click('dialog >> text=Cancel')
// highlight a recognized line on page 1
await pickTool(page, 'Highlight text')
const pt = async (x, y) => page.evaluate(({ x, y }) => { const el = document.querySelector('.viewer .page'); el.scrollIntoView({ block: 'start' }); const r = el.getBoundingClientRect(); const s = r.width / 612; return { x: r.left + x * s, y: r.top + y * s } }, { x, y })
const a = await pt(60, 175), b = await pt(330, 177)
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await wait(800)
console.log('after highlight bar:', await page.evaluate(() => document.querySelector('.inspector__header .kw-panel__title')?.textContent))
await page.screenshot({ path: `${S}/60-ocr.png` })
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[title^="Export"]')])
const d = mupdf.Document.openDocument(fs.readFileSync(await dl.path()), 'application/pdf')
for (let i = 0; i < d.countPages(); i++) console.log(`saved p${i + 1} text:`, JSON.stringify(d.loadPage(i).toStructuredText().asText().replace(/\s+/g, ' ').trim().slice(0, 90)))
console.log('saved p1 annots:', d.loadPage(0).asPDF ? '' : '', mupdf.Document.openDocument(fs.readFileSync(await dl.path()), 'application/pdf').asPDF().loadPage(0).getAnnotations().map((x) => x.getType()))
console.log('errors', errors)
await browser.close()
