import { BASE, CHROME, pickTool } from './kw.mjs'
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
const pt = async (x, y) => page.evaluate(({ x, y }) => { const el = document.querySelector('.viewer .page'); el.scrollIntoView({ block: 'start' }); const r = el.getBoundingClientRect(); const s = r.width / 612; return { x: r.left + x * s, y: r.top + y * s } }, { x, y })
const drag = async (a, b) => { const p = await pt(...a); const q = await pt(...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 8 }); await page.mouse.up(); await wait() }
const applyLabel = () => page.textContent('[title^="Permanently remove"]')

await page.goto(BASE)
await page.setInputFiles('input[type=file][accept="application/pdf,.pdf"]:not([multiple])', `${S}/test.pdf`)
await page.waitForSelector('.viewer .page:not(.page--loading)')
// put an image on page 1 to check pixel removal
await page.setInputFiles('input[type=file][accept^="image/"]', `${S}/shapes.png`); await wait(800)
await pickTool(page, 'Mark text for redaction')
console.log('hint:', await page.textContent('.inspector__body .kw-muted'))
await drag([100, 178], [148, 178])       // "brown fox" region
console.log('after text mark:', await applyLabel())
await pickTool(page, 'Mark an area for redaction')
await drag([150, 240], [320, 420])       // over part of the image
console.log('after area mark:', await applyLabel())
// find & redact
await page.click('.kw-tool[title="Find & redact"]'); await page.fill('[aria-label="Text to find"]', 'LAZY DOG'); await page.keyboard.press('Enter'); await wait()
console.log('find:', await page.textContent('.find-result'))
await page.click('dialog .kw-btn--primary'); await wait(800)
console.log('after find mark:', await applyLabel())
// select one mark and delete, then undo
await pickTool(page, 'Select (Esc)')
const m = await pt(130, 175); await page.mouse.click(m.x, m.y); await wait()
console.log('selected:', await page.textContent('.inspector__section'))
await page.keyboard.press('Delete'); await wait(); console.log('after delete:', await applyLabel())
await page.keyboard.press('Control+z'); await wait(); console.log('after undo:', await applyLabel())
await page.screenshot({ path: `${S}/50-marks.png` })
// download -> warning dialog -> apply and download
await page.click('button[title^="Export"]'); await page.waitForSelector('dialog.modal')
console.log('dialog:', await page.textContent('dialog .modal__content'))
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Apply and download')])
await wait(800)
console.log('apply label after:', await applyLabel())
await page.screenshot({ path: `${S}/51-applied.png` })
const d = mupdf.Document.openDocument(fs.readFileSync(await dl.path()), 'application/pdf').asPDF()
let text = ''; for (let i = 0; i < d.countPages(); i++) text += d.loadPage(i).toStructuredText().asText()
console.log('saved: "brown fox" on p1?', d.loadPage(0).toStructuredText().asText().includes('brown fox'), '| "lazy" anywhere?', /lazy/i.test(text), '| "quick" kept?', text.includes('quick'))
const p1 = d.loadPage(0)
console.log('saved p1 annots:', p1.getAnnotations().map((a) => a.getType()).join(','))
const pix = p1.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true); const px = pix.getPixels(); const st = pix.getStride()
console.log('pixel inside area mark (expect black):', [...px.slice(330 * st + 250 * 3, 330 * st + 250 * 3 + 3)])
console.log('errors', errors)
await browser.close()
