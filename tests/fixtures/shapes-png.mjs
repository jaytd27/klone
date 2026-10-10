import * as mupdf from 'mupdf'
import fs from 'node:fs'
const doc = new mupdf.PDFDocument(); doc.insertPage(-1, doc.addPage([0, 0, 200, 200], 0, {}, '0.2 0.7 0.3 rg 100 100 m 180 100 l 100 180 l f 0.9 0.5 0.1 rg 20 20 60 60 re f'))
fs.writeFileSync(process.argv[2], doc.loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, true, true).asPNG())
