import { BASE, CHROME } from './kw.mjs'
import { chromium } from 'playwright-core'
const S = process.argv[2]
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const shot = (n) => page.screenshot({ path: `${S}/v-${n}.png` })
await page.goto(BASE)
await page.waitForTimeout(600); await shot('01-empty')
await page.setInputFiles('input[data-role=open]', `${S}/test.pdf`)
await page.waitForSelector('.viewer .page:not(.page--loading)'); await page.waitForTimeout(800); await shot('02-view')
await page.click('.kw-segmented__item >> text=Annotate'); await page.click('.kw-tool >> text=Highlight')
const el = await page.$('.viewer .page'); const r = await el.boundingBox(); const s = r.width / 612
await page.mouse.move(r.x + 60 * s, r.y + 175 * s); await page.mouse.down(); await page.mouse.move(r.x + 330 * s, r.y + 177 * s, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(800)
await page.click('.kw-tool >> text=Comment'); await page.mouse.click(r.x + 520 * s, r.y + 120 * s); await page.waitForTimeout(600)
await page.keyboard.type('Check the opening line'); await page.click('.viewer', { position: { x: 5, y: 300 } }); await page.waitForTimeout(800)
await page.mouse.click(r.x + 200 * s, r.y + 175 * s); await page.waitForTimeout(500); await shot('03-annotate-selected')
for (const m of ['Edit', 'Organize', 'Sign', 'Protect']) { await page.click(`.kw-segmented__item >> text=${m}`); await page.waitForTimeout(300); await shot(`04-mode-${m.toLowerCase()}`) }
await page.fill('[aria-label="Search the document"]', 'lazy'); await page.keyboard.press('Enter'); await page.waitForTimeout(800); await shot('05-search')
await page.keyboard.press('Control+k'); await page.waitForTimeout(300); await page.keyboard.type('ocr'); await page.waitForTimeout(200); await shot('06-command'); await page.keyboard.press('Escape')
await page.click('[aria-label^="Theme:"]'); await page.waitForTimeout(500); await shot('07-light')
await page.click('[aria-label^="Theme:"]'); await page.waitForTimeout(200); await page.click('[aria-label^="Theme:"]'); await page.waitForTimeout(200)
console.log('theme attr now:', await page.evaluate(() => document.documentElement.getAttribute('data-theme')))
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800); await shot('08-mobile')
console.log('mobile hscroll:', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
await page.setViewportSize({ width: 1440, height: 900 }); await page.click('.viewer', { position: { x: 3, y: 3 } }); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); console.log('focus ring on', await page.evaluate(() => document.activeElement?.className.slice(0, 30)), '→', await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor }))
console.log('fonts:', await page.evaluate(async () => { await document.fonts.ready; return ['Space Grotesk', 'IBM Plex Sans', 'IBM Plex Mono'].map((f) => `${f}:${document.fonts.check(`bold 12px "${f}"`)}`).join(' ') }))
console.log('errors', errors)
await browser.close()
