import fs from 'node:fs'
import * as mupdf from 'mupdf'
let last
globalThis.self = { postMessage: (m) => { last = m } }
await import(new URL('../../src/pdf/pdf.worker.ts', import.meta.url).href)
let id = 0
const call = (req) => { self.onmessage({ data: { id: ++id, req } }); if (!last.ok) throw new Error(req.type + ': ' + last.error); return last.result }
// "OCR" words from the original test.pdf page 1 lines, split evenly per character
const orig = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf').loadPage(0)
const words = []
for (const block of JSON.parse(orig.toStructuredText().asJSON()).blocks) for (const line of block.lines ?? []) {
  const { x, y, w, h } = line.bbox; const per = w / line.text.length; let pos = 0
  for (const word of line.text.split(' ')) { words.push({ text: word, bbox: [x + pos * per, y, x + (pos + word.length) * per, y + h], baseline: line.y }); pos += word.length + 1 }
}
const data = fs.readFileSync(process.argv[3])
const st = call({ type: 'open', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.length) })
console.log('textStats before', JSON.stringify(call({ type: 'textStats' })))
// rotated page 2 (displayed 792x612): a horizontal word at display (100..220, top 300, baseline 320)
const rotWords = [{ text: 'Sideways', bbox: [100, 300, 220, 325], baseline: 320 }]
call({ type: 'addOcrText', pages: [{ page: st.pages[0].id, words }, { page: st.pages[1].id, words: rotWords }] })
console.log('textStats after', JSON.stringify(call({ type: 'textStats' })))
const hit = call({ type: 'search', query: 'lazy dog', matchCase: false })
const origHit = orig.toStructuredText().search('lazy dog')
console.log('search "lazy dog" ocr quad', hit[0]?.quads[0].map(Math.round).join(','), '\n                 original quad', origHit[0][0].map(Math.round).join(','))
const side = call({ type: 'search', query: 'sideways', matchCase: false })
console.log('rotated page hit', side.length, side[0]?.quads[0].map(Math.round).join(','), '(expect x≈100..220, y≈~300..325)')
const saved = call({ type: 'save' })
const d = mupdf.Document.openDocument(saved, 'application/pdf')
fs.writeFileSync(process.argv[4], d.loadPage(0).toPixmap(mupdf.Matrix.scale(0.7, 0.7), mupdf.ColorSpace.DeviceRGB, false, true).asPNG())
console.log('page 1 text after save:', JSON.stringify(d.loadPage(0).toStructuredText().asText().slice(0, 80)))
