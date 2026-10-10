import * as mupdf from 'mupdf'
import fs from 'node:fs'
// Image-only "scan" of test.pdf pages 1-3; page 2 stored with /Rotate 90 like a sideways scan.
const src = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf')
const out = new mupdf.PDFDocument()
for (let i = 0; i < 3; i++) {
  const p = src.loadPage(i)
  const [, , w, h] = p.getBounds()
  const pix = p.toPixmap(mupdf.Matrix.scale(200 / 72, 200 / 72), mupdf.ColorSpace.DeviceRGB, false, true)
  const img = out.addImage(new mupdf.Image(pix))
  const page = out.addPage([0, 0, w, h], i === 1 ? 90 : 0, { XObject: { Im0: img } }, `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`)
  out.insertPage(-1, page)
}
fs.writeFileSync(process.argv[3], out.saveToBuffer('compress').asUint8Array())
const chk = mupdf.Document.openDocument(fs.readFileSync(process.argv[3]), 'application/pdf')
console.log('scan pages', chk.countPages(), 'text on p1:', JSON.stringify(chk.loadPage(0).toStructuredText().asText().trim()))
const rp = chk.loadPage(1); console.log('rotated page bounds', rp.getBounds(), 'transform', rp.getTransform())
console.log('p1 transform', chk.loadPage(0).getTransform())
