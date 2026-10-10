import fs from 'node:fs'
import * as mupdf from 'mupdf'
let last
globalThis.self = { postMessage: (m) => { last = m } }
await import(new URL('../../src/pdf/pdf.worker.ts', import.meta.url).href)
let id = 0
const call = (req) => { self.onmessage({ data: { id: ++id, req } }); if (!last.ok) throw new Error(req.type + ': ' + last.error); return last.result }
const report = (label, bytes) => {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()
  for (const a of d.loadPage(0).getAnnotations()) {
    const o = a.getObject()
    const t = a.getType()
    let extra = ''
    if (t === 'Stamp') {
      const xo = o.get('AP').get('N').get('Resources').get('XObject')
      xo.forEach((img) => { const m = img.get('SMask'); extra += ` image ${img.get('Width').asNumber()}x${img.get('Height').asNumber()} data ${img.readStream().getLength()}B mask ${m.isNull() ? '-' : m.get('ColorSpace').toString() + ' ' + m.readStream().getLength() + 'B'}` })
      extra += ` IT=${o.get('IT').toString()}`
    }
    if (t === 'FreeText') extra = ` CL=${o.get('CL').isNull() ? 'none' : o.get('CL').toString()}`
    console.log(`${label}: ${t}${extra}`)
  }
}
// 1. fresh annotations
const data = fs.readFileSync(process.argv[2])
let st = call({ type: 'open', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.length) })
const W = 40, H = 20, rgba = new Uint8ClampedArray(W * H * 4)
for (let i = 0; i < W * H; i++) rgba.set(i % W < 20 ? [0, 0, 255, 255] : [0, 0, 0, 0], i * 4)
const style = { color: [0, 0, 0], opacity: 1, width: 0, font: 'Helv', fontSize: 14 }
call({ type: 'createAnnot', page: st.pages[0].id, spec: { kind: 'image', rect: [100, 100, 180, 140], image: { rgba: rgba.buffer, width: W, height: H } }, style })
const t = call({ type: 'createAnnot', page: st.pages[0].id, spec: { kind: 'text', at: [300, 300], text: '09/10/2026' }, style })
call({ type: 'updateAnnot', page: st.pages[0].id, annot: t.annot, patch: { fontSize: 18 } })
report('fresh', call({ type: 'save' }))
// 2. a file as earlier Kwoon versions wrote it (straight from MuPDF, with an
// ICC-tagged soft mask, /IT null and a stray text-box callout), re-exported
const legacy = new mupdf.PDFDocument()
legacy.insertPage(-1, legacy.addPage([0, 0, 612, 792], 0, {}, ''))
const lp = legacy.loadPage(0)
const color = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, W, H], false)
const alpha = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, W, H], false)
alpha.clear(128)
const stamp = lp.createAnnotation('Stamp')
stamp.setRect([100, 100, 180, 140])
stamp.setIntent('StampImage')
stamp.setStampImage(new mupdf.Image(color, new mupdf.Image(alpha)))
stamp.update()
const box = lp.createAnnotation('FreeText')
box.setContents('09/10/2026')
box.setRect([300, 300, 400, 330])
box.update()
const old = legacy.saveToBuffer('garbage,compress').asUint8Array()
st = call({ type: 'open', data: old.buffer.slice(old.byteOffset, old.byteOffset + old.length) })
report('before', old)
const fixed = call({ type: 'save' })
call({ type: 'undo' }); call({ type: 'redo' })
console.log('dirty after export:', call({ type: 'redo' }).dirty)
report('re-exported', fixed)
