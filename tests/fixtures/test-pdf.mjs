import * as mupdf from 'mupdf'
const doc = new mupdf.PDFDocument()
const font = doc.addSimpleFont(new mupdf.Font('Times-Roman'))
const sizes = [[612, 792], [612, 792], [792, 612], [595, 842], [612, 792], [612, 792]]
sizes.forEach(([w, h], i) => {
  const content = `0.18 0.44 0.87 rg 40 ${h - 120} ${w - 80} 70 re f
BT /F1 36 Tf 1 1 1 rg 60 ${h - 95} Td (Kwoon test page ${i + 1}) Tj ET
BT /F1 14 Tf 0 0 0 rg 60 ${h - 160} Td 18 TL (Page size ${w} x ${h} pt.) Tj T* (The quick brown fox jumps over the lazy dog.) Tj ET
0.9 0.3 0.2 RG 4 w 60 60 m ${w - 60} 200 l S`
  const page = doc.addPage([0, 0, w, h], 0, { Font: { F1: font } }, content)
  doc.insertPage(-1, page)
})
const buf = doc.saveToBuffer('compress')
const fs = await import('node:fs')
fs.writeFileSync(process.argv[2], buf.asUint8Array())
console.log('pages', doc.countPages())
