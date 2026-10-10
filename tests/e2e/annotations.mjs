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
const idle = async () => { await page.waitForFunction(() => !document.querySelector('[title^="Undo"]')?.closest('.toolbar')?.querySelector('button[title^="Open"]:disabled')); await page.waitForTimeout(400) }
// page-space -> screen helper for viewer page n (0-based), widths in PDF points
const pt = async (n, x, y) => page.evaluate(({ n, x, y }) => {
  const el = document.querySelectorAll('.viewer .page')[n]; el.scrollIntoView({ block: 'center' })
  const r = el.getBoundingClientRect(); const s = r.width / (n === 1 ? 792 : 612)
  return { x: r.left + x * s, y: r.top + y * s }
}, { n, x, y })
const drag = async (n, pts) => {
  const first = await pt(n, ...pts[0]); await page.mouse.move(first.x, first.y); await page.mouse.down()
  for (const p of pts.slice(1)) { const q = await pt(n, ...p); await page.mouse.move(q.x, q.y, { steps: 5 }) }
  await page.mouse.up(); await idle()
}
const tool = (name) => pickTool(page, name)
const bar = async (label) => console.log(label.padEnd(26), await page.evaluate(() => document.querySelector('.inspector__section')?.textContent?.slice(0, 60)))

await page.goto(BASE)
await page.setInputFiles('input[type=file]:not([multiple])', `${S}/test.pdf`)
await page.waitForSelector('.viewer .page:not(.page--loading)')
// rotate page 2 so we test markup on a rotated page
await page.click('.thumbs .thumb >> nth=1'); await mode(page, 'Organize'); await page.click('.kw-tool[title="Rotate right"]'); await idle()
await bar('initial')
await tool('Highlight text'); await bar('highlight tool')
await drag(0, [[60, 172], [200, 174], [345, 175]]); await bar('after highlight')
await tool('Rectangle'); await drag(0, [[100, 300], [300, 400]])
await tool('Freehand'); await drag(0, [[100, 500], [150, 540], [200, 500], [250, 560]])
await tool('Arrow'); await drag(0, [[350, 300], [500, 420]])
await tool('Sticky note'); const np = await pt(0, 520, 120); await page.mouse.click(np.x, np.y); await idle()
console.log('comment focused:', await page.evaluate(() => document.activeElement?.className))
await page.keyboard.type('Check this'); await page.keyboard.press('Control+Enter'); await idle(); await bar('note commented')
// select rectangle by clicking its edge, restyle and move it
await tool('Select (Esc)')
const edge = await pt(0, 100, 350); await page.mouse.click(edge.x, edge.y); await idle(); await bar('rect selected')
await page.click('.kw-swatch[aria-label="Green"]'); await idle()
await page.selectOption('[aria-label="Stroke width"]', '5'); await idle(); await bar('rect restyled')
await drag(0, [[100, 350], [150, 370]]); await bar('rect moved')
// select ink and delete with keyboard, then undo
const ink = await pt(0, 150, 540); await page.mouse.click(ink.x, ink.y); await idle(); await bar('ink selected')
await page.keyboard.press('Delete'); await idle(); await bar('ink deleted')
await page.keyboard.press('Control+z'); await idle(); await bar('after undo')
// highlight on the rotated page 2: text runs vertically there. Page 2 test text lines are at x≈ 792-160..
await tool('Highlight text')
await drag(1, [[620, 60], [622, 200], [624, 340]])
await page.screenshot({ path: `${S}/20-annots-p2.png` })
await (await page.$('.viewer .page')).scrollIntoViewIfNeeded()
await page.evaluate(() => document.querySelector('.viewer').scrollTop = 0); await page.waitForTimeout(600)
await page.screenshot({ path: `${S}/21-annots-p1.png` })
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[title^="Export"]')])
const d = mupdf.Document.openDocument(fs.readFileSync(await dl.path()), 'application/pdf').asPDF()
for (let i = 0; i < 2; i++) {
  const p = d.loadPage(i)
  for (const a of p.getAnnotations()) console.log(`p${i + 1}`, a.getType().padEnd(9), 'bounds', a.getBounds().map(Math.round).join(','), 'color', a.getColor().map((c) => c.toFixed(2)).join(','), a.hasBorder() ? 'bw ' + a.getBorderWidth() : '', JSON.stringify(a.getContents()))
}
console.log('errors', errors)
await browser.close()
