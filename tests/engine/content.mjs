import fs from 'node:fs'
import * as mupdf from 'mupdf'
let last
globalThis.self = { postMessage: (m) => { last = m } }
await import(new URL('../../src/pdf/pdf.worker.ts', import.meta.url).href)
let id = 0
const call = (req) => { self.onmessage({ data: { id: ++id, req } }); if (!last.ok) throw new Error(req.type + ': ' + last.error); return last.result }
const data = fs.readFileSync(process.argv[2])
const st = call({ type: 'open', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.length) })
const [p1] = st.pages.map((p) => p.id)
call({ type: 'rotate', pages: [1], degrees: 90 })
const style = { color: [0.1, 0.3, 0.8], opacity: 1, width: 2, font: 'TiRo', fontSize: 20 }
const t = call({ type: 'createAnnot', page: p1, spec: { kind: 'text', at: [80, 230], text: 'Typed with Kwoon\nTwo lines' }, style })
const im = call({ type: 'createAnnot', page: p1, spec: { kind: 'image', rect: [80, 320, 200, 380], image: { rgba: new Uint8ClampedArray(60 * 30 * 4).fill(255).buffer, width: 60, height: 30 } }, style })
let annots = call({ type: 'listAnnots', page: p1 })
console.log(annots.map((a) => `${a.type} rect=${a.rect?.map(Math.round)} font=${a.font} size=${a.fontSize} color=${a.color?.map((c) => c.toFixed(2))}`).join('\n'))
call({ type: 'updateAnnot', page: p1, annot: t.annot, patch: { contents: 'Edited text that is a bit longer', fontSize: 16 } })
call({ type: 'updateAnnot', page: p1, annot: im.annot, patch: { rect: [80, 320, 320, 440] } })
annots = call({ type: 'listAnnots', page: p1 })
console.log('after edit:', annots.map((a) => `${a.type} rect=${a.rect?.map(Math.round)} size=${a.fontSize} contents=${JSON.stringify(a.contents)}`).join(' | '))
const wm = call({ type: 'watermark', pages: [0, 1], spec: { text: 'CONFIDENTIAL (draft)', fontSize: 60, color: [0.9, 0.1, 0.1], opacity: 0.3, angle: 45 } })
console.log('watermark ok, dirty', wm.dirty, 'canUndo', wm.canUndo)
call({ type: 'watermark', pages: [0], spec: { text: 'Second', fontSize: 30, color: [0, 0, 0], opacity: 0.5, angle: 0 } })
const saved = call({ type: 'save' })
fs.writeFileSync(process.argv[3], saved)
const d = mupdf.Document.openDocument(saved, 'application/pdf').asPDF()
for (let i = 0; i < 2; i++) fs.writeFileSync(process.argv[3].replace('.pdf', `-p${i + 1}.png`), d.loadPage(i).toPixmap(mupdf.Matrix.scale(0.8, 0.8), mupdf.ColorSpace.DeviceRGB, false, true).asPNG())
console.log('p1 text has watermark:', d.loadPage(0).toStructuredText().asText().includes('CONFIDENTIAL (draft)'))
call({ type: 'undo' }); call({ type: 'undo' })
const t2 = call({ type: 'save' }); const d2 = mupdf.Document.openDocument(t2, 'application/pdf').asPDF()
console.log('after 2 undos watermark gone:', !d2.loadPage(0).toStructuredText().asText().includes('CONFIDENTIAL'))
