import { BASE, CHROME, mode } from './kw.mjs'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import * as mupdf from 'mupdf'
const S = process.argv[2]
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('dialog', (d) => { console.log('DIALOG', d.message()); d.accept() })
const thumbs = '.thumbs .thumb'
const settle = () => page.waitForFunction(() => !document.querySelector('button[title^="Open a PDF"]:disabled')).then(() => page.waitForTimeout(250))
const summary = async (label) => console.log(label.padEnd(22), await page.evaluate(() => ({
  n: document.querySelectorAll('.thumbs .thumb').length,
  sel: document.querySelector('.toolrow__scope')?.textContent,
  picked: [...document.querySelectorAll('.thumb.is-selected .kw-thumb__num')].map((e) => e.textContent).join(','),
  undo: !document.querySelector('[title^="Undo"]').disabled, redo: !document.querySelector('[title^="Redo"]').disabled,
  name: document.querySelector('.topbar__file .kw-badge')?.textContent,
  shapes: [...document.querySelectorAll('.thumbs .page')].map((e) => (e.offsetWidth > e.offsetHeight ? 'L' : 'P')).join(''),
})))
const pdfText = (bytes) => { const d = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF(); const out = []; for (let i = 0; i < d.countPages(); i++) { const p = d.loadPage(i); const t = p.toStructuredText().asText().match(/Kwoon test page \d/)?.[0].slice(-6) ?? 'blank'; const r = p.getObject().getInheritable('Rotate'); out.push(t + (r.isNumber() && r.asNumber() ? `@${r.asNumber()}` : '')) } return out }

await page.goto(BASE)
await page.setInputFiles('input[type=file]:not([multiple])', `${S}/test.pdf`)
await page.waitForSelector('.viewer .page:not(.page--loading)')
await summary('opened')
await mode(page, 'Organize')
await page.click('.kw-tool[title="Rotate right"]'); await settle(); await summary('rotate p1 right')
await page.click(`${thumbs} >> nth=1`); await page.click(`${thumbs} >> nth=3`, { modifiers: ['Control'] }); await summary('select 2 + ctrl 4')
await page.click('.kw-tool[title^="Delete"]'); await settle(); await summary('delete')
await page.keyboard.press('Control+z'); await settle(); await summary('undo')
await page.keyboard.press('Control+y'); await settle(); await summary('redo')
// Drag last thumbnail to before the first
await page.locator(`${thumbs} >> nth=3`).dragTo(page.locator(`${thumbs} >> nth=0`), { targetPosition: { x: 40, y: 10 } })
await settle(); await summary('drag 4 -> before 1')
await page.click(`${thumbs} >> nth=1`)
await page.click('.kw-tool[title^="Insert a blank page"]'); await settle(); await summary('insert blank after 2')
await page.click('.kw-tool[title^="Insert or merge"]')
await page.setInputFiles('input[type=file][multiple]', `${S}/test.pdf`); await settle(); await summary('insert test.pdf')
// Simulate dropping a file onto the end of the sidebar
const b64 = fs.readFileSync(`${S}/test.pdf`).toString('base64')
await page.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const dt = new DataTransfer(); dt.items.add(new File([bytes], 'dropped.pdf', { type: 'application/pdf' }))
  const nav = document.querySelector('.thumbs'); const r = nav.getBoundingClientRect()
  const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 50, clientY: r.bottom - 2 }
  nav.dispatchEvent(new DragEvent('dragover', opts)); nav.dispatchEvent(new DragEvent('drop', opts))
}, b64)
await settle(); await summary('drop file at end')
// Extract pages 1-3
await page.click(`${thumbs} >> nth=0`); await page.click(`${thumbs} >> nth=2`, { modifiers: ['Shift'] }); await summary('select 1..3 (shift)')
let [dl] = await Promise.all([page.waitForEvent('download'), page.click('[title="Save these pages as a new PDF"]')])
console.log('extract', dl.suggestedFilename(), pdfText(fs.readFileSync(await dl.path())).join(' '))
;[dl] = await Promise.all([page.waitForEvent('download'), page.click('button[title^="Export"]')])
const final = pdfText(fs.readFileSync(await dl.path()))
console.log('final', final.length, final.join(' '))
await summary('after download')
await page.screenshot({ path: `${S}/10-pageops.png` })
// Can't delete everything
await page.click(`${thumbs} >> nth=0`); await page.locator('.thumbs').press('Control+a'); await summary('ctrl+a')
console.log('delete-all disabled:', await page.isDisabled('.kw-tool[title^="Delete"]'))
await page.locator(`${thumbs} >> nth=0`).press('Delete'); await page.waitForTimeout(300)
console.log('banner:', await page.textContent('.toast').catch(() => null))
console.log('errors', errors)
await browser.close()
