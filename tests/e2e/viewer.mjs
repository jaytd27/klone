import { BASE, CHROME } from './kw.mjs'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const S = process.argv[2]
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(BASE)
await page.screenshot({ path: `${S}/01-empty.png` })
await page.setInputFiles('input[type=file]:not([multiple])', `${S}/test.pdf`)
await page.waitForSelector('.viewer .page:not(.page--loading)', { timeout: 30000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${S}/02-open.png` })
const info = await page.evaluate(() => ({
  pages: document.querySelectorAll('.viewer .page').length,
  thumbs: document.querySelectorAll('.thumb').length,
  drawnThumbs: document.querySelectorAll('.thumb .page:not(.page--loading)').length,
  canvasW: document.querySelector('.viewer canvas').width,
  zoom: document.querySelector('[aria-label="Zoom"]').selectedOptions[0].textContent,
  title: document.title,
}))
console.log('after open', info)
// Navigate via thumbnail
await page.click('.thumb >> nth=3')
await page.waitForTimeout(600)
console.log('after thumb 4 click: page input =', await page.inputValue('.page-input input'))
// Page input
await page.fill('.page-input input', '6'); await page.keyboard.press('Enter'); await page.waitForTimeout(600)
console.log('after typing 6:', await page.inputValue('.page-input input'), 'scrollTop', await page.evaluate(() => document.querySelector('.viewer').scrollTop))
// Zoom in via keyboard
await page.click('.page-input input'); await page.keyboard.press('Escape')
await page.click('.viewer')
await page.keyboard.press('Control+='); await page.waitForTimeout(800)
console.log('after ctrl+=:', await page.evaluate(() => document.querySelector('[aria-label="Zoom"]').selectedOptions[0].textContent), 'page', await page.inputValue('.page-input input'))
await page.screenshot({ path: `${S}/03-zoomed.png` })
await page.selectOption('[aria-label="Zoom"]', '0.5'); await page.waitForTimeout(800)
await page.screenshot({ path: `${S}/04-50pct.png` })
// Download
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button[title^=Export]')])
const p = await download.path()
const bytes = fs.readFileSync(p)
console.log('download', download.suggestedFilename(), bytes.length, bytes.subarray(0, 5).toString())
// Dark mode
await page.emulateMedia({ colorScheme: 'dark' }); await page.selectOption('[aria-label="Zoom"]', 'fit'); await page.waitForTimeout(800)
await page.screenshot({ path: `${S}/05-dark.png` })
// Error path: not a PDF
fs.writeFileSync(`${S}/bad.pdf`, 'hello this is not a pdf')
await page.setInputFiles('input[type=file]:not([multiple])', `${S}/bad.pdf`); await page.waitForTimeout(800)
console.log('banner:', await page.textContent('.toast').catch(() => null))
// Mobile
await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(600)
await page.screenshot({ path: `${S}/06-mobile.png` })
console.log('hscroll body', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
const after = await page.evaluate(() => ({ pages: document.querySelectorAll('.viewer .page').length, drawn: document.querySelectorAll('.viewer .page:not(.page--loading)').length })); console.log('after bad open, still showing', after)
console.log('errors', errors.filter(e => !e.includes('repair') && !e.includes('version marker')))
await browser.close()
