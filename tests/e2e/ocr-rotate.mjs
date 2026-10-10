import { BASE, CHROME, mode } from './kw.mjs'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import * as mupdf from 'mupdf'
const S = process.argv[2]
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(BASE)
await page.setInputFiles('input[type=file][accept="application/pdf,.pdf"]:not([multiple])', `${S}/scan.pdf`)
await page.waitForSelector('.toast')
await page.click('.thumbs .thumb >> nth=1'); await mode(page, 'Organize'); await page.click('.kw-tool[title="Rotate left"]'); await page.waitForTimeout(800)
await mode(page, 'Edit'); await page.click('.kw-tool[title="Recognise text in scanned pages"]'); await page.waitForSelector('dialog.modal')
await page.click('dialog >> text=Current page'); await page.waitForTimeout(300)
console.log('button:', await page.textContent('dialog .kw-btn--primary'))
await page.click('dialog .kw-btn--primary')
await page.waitForSelector('.toast >> text=/Recognised|No text/', { timeout: 240000 })
console.log('result:', await page.textContent('.toast'))
await page.screenshot({ path: `${S}/61-ocr-rotated.png` })
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[title^="Export"]')])
const d = mupdf.Document.openDocument(fs.readFileSync(await dl.path()), 'application/pdf')
console.log('saved p2 text:', JSON.stringify(d.loadPage(1).toStructuredText().asText().replace(/\s+/g, ' ').trim()))
const hit = d.loadPage(1).toStructuredText().search('lazy dog')
console.log('p2 search quad:', hit[0]?.[0].map(Math.round).join(','), '| p2 bounds', d.loadPage(1).getBounds())
console.log('errors', errors)
await browser.close()
