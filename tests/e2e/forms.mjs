import { BASE, CHROME, pickTool } from './kw.mjs'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import * as mupdf from 'mupdf'
const S = process.argv[2]
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const wait = () => page.waitForTimeout(500)
const vals = (bytes) => { const d = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF(); return Object.fromEntries(d.loadPage(0).getWidgets().map((w) => [w.getName() + (w.isRadioButton() ? '#' + w.getObject().asIndirect() : ''), w.getValue() + (w.isButton() ? '/' + w.getObject().get('AS').asName() : '')])) }

await page.goto(BASE)
await page.setInputFiles('input[type=file]:not([multiple])', `${S}/form.pdf`)
await page.waitForSelector('.form-field')
console.log('fields:', await page.$$eval('.form-field', (els) => els.map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('aria-label')}`).join(' ')))
await page.click('[aria-label="name"]'); await page.keyboard.press('Control+a'); await page.keyboard.type('Grace Hopper')
await page.keyboard.press('Tab')
console.log('focused after Tab:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
await page.keyboard.type('Line one'); await page.keyboard.press('Enter'); await page.keyboard.type('Line two'); await page.keyboard.press('Tab'); await wait()
await page.click('[aria-label="subscribe"]'); await wait()
await page.click('[aria-label="plan"] >> nth=1'); await wait()
await page.selectOption('[aria-label="country"]', 'Japan'); await wait()
await page.selectOption('[aria-label="colour"]', 'b'); await wait()
console.log('state:', await page.evaluate(() => ({ sub: document.querySelector('[aria-label="subscribe"]').getAttribute('aria-checked'), plan: [...document.querySelectorAll('[aria-label="plan"]')].map((e) => e.getAttribute('aria-checked')).join(','), dirty: document.querySelector('.topbar__file .kw-badge').textContent })))
// Escape reverts an edit without committing
await page.click('[aria-label="name"]'); await page.keyboard.press('Control+a'); await page.keyboard.type('XYZ'); await page.keyboard.press('Escape'); await wait()
console.log('after escape name =', await page.inputValue('[aria-label="name"]'))
await page.click('.viewer', { position: { x: 5, y: 5 } })
await page.keyboard.press('Control+z'); await wait()
console.log('after undo colour =', await page.inputValue('[aria-label="colour"]'))
await page.keyboard.press('Control+y'); await wait()
console.log('after redo colour =', await page.inputValue('[aria-label="colour"]'))
await page.screenshot({ path: `${S}/30-form.png` })
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[title^="Export"]')])
console.log('saved values:', vals(fs.readFileSync(await dl.path())))
// Drawing tools pass through fields
await pickTool(page, 'Rectangle')
console.log('field pointer-events with rect tool:', await page.$eval('[aria-label="name"]', (e) => getComputedStyle(e).pointerEvents))
console.log('errors', errors)
await browser.close()
