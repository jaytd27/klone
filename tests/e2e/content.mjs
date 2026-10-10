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
const pt = async (x, y) => page.evaluate(({ x, y }) => { const el = document.querySelector('.viewer .page'); const r = el.getBoundingClientRect(); const s = r.width / 612; return { x: r.left + x * s, y: r.top + y * s } }, { x, y })
const bar = async () => page.evaluate(() => document.querySelector('.inspector__section')?.textContent?.slice(0, 50))

await page.goto(BASE)
await page.setInputFiles('input[type=file][accept="application/pdf,.pdf"]:not([multiple])', `${S}/test.pdf`)
await page.waitForSelector('.viewer .page:not(.page--loading)')
// --- text box
await pickTool(page, 'Text box')
let p = await pt(80, 250); await page.mouse.click(p.x, p.y); await wait(200)
console.log('editor open:', await page.isVisible('.text-box-editor'))
await page.keyboard.type('Hello Kwoon'); await page.keyboard.press('Control+Enter'); await wait()
console.log('after create bar:', await bar())
await page.selectOption('[aria-label="Font size"]', '24'); await wait()
await page.selectOption('[aria-label="Font"]', 'TiRo'); await wait()
await pickTool(page, 'Select (Esc)')
p = await pt(110, 262); await page.mouse.dblclick(p.x, p.y); await wait(300)
console.log('edit editor value:', await page.inputValue('.text-box-editor').catch(() => 'NO EDITOR'))
await page.keyboard.press('End'); await page.keyboard.type(' — edited'); await page.keyboard.press('Control+Enter'); await wait()
// --- image
await page.setInputFiles('input[type=file][accept^="image/"]', `${S}/shapes.png`); await wait(800)
console.log('image bar:', await bar(), 'handles:', await page.locator('.annot-handle').count())
const h = page.locator('.annot-handle').nth(2); const hb = await h.boundingBox()
await page.mouse.move(hb.x + 4, hb.y + 4); await page.mouse.down(); await page.mouse.move(hb.x + 80, hb.y + 20, { steps: 6 }); await page.mouse.up(); await wait()
// --- signature: draw
await mode(page, 'Sign'); await page.click('.kw-tool[title="Add signature"]'); await page.waitForSelector('dialog.modal')
const c = await page.locator('.signature-pad canvas').boundingBox()
await page.mouse.move(c.x + 40, c.y + 120); await page.mouse.down()
for (const [dx, dy] of [[80, 40], [120, 140], [180, 50], [240, 130], [320, 60], [400, 110]]) await page.mouse.move(c.x + dx, c.y + dy, { steps: 6 })
await page.mouse.up()
await page.click('text=Place signature'); await wait(800)
console.log('after drawn signature bar:', await bar(), '| saved:', await page.evaluate(() => JSON.parse(localStorage.getItem('kwoon.signatures') || '[]').length))
// --- signature: type, check Saved tab exists
await page.click('.kw-tool[title="Add signature"]'); await page.waitForSelector('dialog.modal')
console.log('saved tab selected:', await page.getAttribute('.tabs [aria-selected="true"]', 'role'), await page.textContent('.tabs [aria-selected="true"]'))
await page.click('.tabs >> text=Type'); await page.fill('.signature-type input', 'Ada Lovelace'); await page.click('text=Place signature'); await wait(800)
// --- watermark
await mode(page, 'Edit'); await page.click('.kw-tool[title="Add a watermark"]'); await page.waitForSelector('dialog.modal'); await page.fill('#wm-text', 'DRAFT COPY')
await page.screenshot({ path: `${S}/40-wm-dialog.png` })
await page.click('text=Add watermark'); await wait(1200)
await page.click('.viewer', { position: { x: 3, y: 3 } })
await page.evaluate(() => (document.querySelector('.viewer').scrollTop = 0)); await wait(700)
await page.screenshot({ path: `${S}/41-content.png` })
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[title^="Export"]')])
const d = mupdf.Document.openDocument(fs.readFileSync(await dl.path()), 'application/pdf').asPDF()
const pg = d.loadPage(0)
for (const a of pg.getAnnotations()) {
  const extra = a.getType() === 'FreeText' ? JSON.stringify(a.getContents()) + ' ' + JSON.stringify(a.getDefaultAppearance()) : a.getType() === 'Stamp' ? 'smask=' + a.getObject().get('AP').get('N').get('Resources').get('XObject').get('I').get('SMask').isNull().toString().replace('true', 'NO').replace('false', 'yes') : ''
  console.log(a.getType().padEnd(9), a.getRect().map(Math.round).join(','), extra)
}
// Acrobat-compatibility: masks DeviceGray, stamp intent a name, no stray text-box callout
for (const a of pg.getAnnotations()) {
  const o = a.getObject()
  if (a.getType() === 'Stamp') o.get('AP').get('N').get('Resources').get('XObject').forEach((img) => console.log('portable stamp:', 'mask', img.get('SMask').isNull() ? '-' : img.get('SMask').get('ColorSpace').toString(), 'IT', o.get('IT').toString()))
  if (a.getType() === 'FreeText') console.log('portable text box: CL', o.get('CL').isNull() ? 'none' : 'PRESENT')
}
console.log('watermark on all pages:', [...Array(d.countPages()).keys()].every((i) => d.loadPage(i).toStructuredText().asText().includes('DRAFT COPY')))
console.log('errors', errors)
await browser.close()
