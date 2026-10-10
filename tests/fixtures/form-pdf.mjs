import * as mupdf from 'mupdf'
import fs from 'node:fs'
const doc = new mupdf.PDFDocument()
const helv = doc.addObject({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' })
const font = doc.addSimpleFont(new mupdf.Font('Helvetica'))
const labels = [['Full name', 700], ['Comments', 640], ['Subscribe', 560], ['Plan', 520], ['Country', 460], ['Colour', 400]]
let content = 'BT /F1 22 Tf 72 740 Td (Klone form test) Tj ET\n'
for (const [t, y] of labels) content += `BT /F1 12 Tf 72 ${y + 4} Td (${t}) Tj ET\n`
const pageObj = doc.addPage([0, 0, 612, 792], 0, { Font: { F1: font } }, content)
doc.insertPage(-1, pageObj)
const page = doc.findPage(0)
const fields = doc.newArray(), annots = doc.newArray()
const widget = (extra) => {
  const w = doc.addObject({ Type: 'Annot', Subtype: 'Widget', F: 4, P: page, ...extra })
  annots.push(w); return w
}
const str = (v) => doc.newString(v)
const da = str('/Helv 12 Tf 0 g')
const field = (extra) => { const f = widget({ DA: da, ...extra }); fields.push(f); return f }
field({ FT: 'Tx', T: str('name'), Rect: [160, 694, 450, 716], V: str('Ada Lovelace'), MK: { BG: [0.95, 0.95, 1] } })
field({ FT: 'Tx', T: str('comments'), Ff: 4096, Rect: [160, 590, 450, 656], V: str('') })
field({ FT: 'Btn', T: str('subscribe'), Rect: [160, 556, 176, 572], V: doc.newName('Off'), AS: doc.newName('Off'), MK: { CA: str('4') }, AP: { N: { Yes: doc.addStream('0 0 1 rg 3 3 10 10 re f', { BBox: [0, 0, 16, 16] }), Off: doc.addStream('', { BBox: [0, 0, 16, 16] }) } } })
// radio group with two kids
const radio = doc.addObject({ FT: 'Btn', T: str('plan'), Ff: 49152, V: doc.newName('Basic'), DA: da })
const kids = doc.newArray()
for (const [i, name] of ['Basic', 'Pro'].entries()) {
  const k = widget({ Parent: radio, Rect: [160 + i * 80, 516, 176 + i * 80, 532], AS: doc.newName(i === 0 ? 'Basic' : 'Off'), MK: { CA: str('l') },
    AP: { N: { [name]: doc.addStream('0 0 0 rg 8 8 m 8 12 l 12 12 l 12 8 l f', { BBox: [0, 0, 16, 16] }), Off: doc.addStream('', { BBox: [0, 0, 16, 16] }) } } })
  kids.push(k)
}
radio.put('Kids', kids); fields.push(radio)
field({ FT: 'Ch', T: str('country'), Ff: 131072, Opt: ['Canada', 'France', 'Japan', 'Kenya'].map(str), V: str('Canada'), Rect: [160, 456, 330, 476] })
field({ FT: 'Ch', T: str('colour'), Opt: [['r', 'Red'], ['g', 'Green'], ['b', 'Blue']].map(([e, d]) => { const a = doc.newArray(); a.push(str(e)); a.push(str(d)); return a }), V: str('g'), Rect: [160, 360, 330, 420] })
field({ FT: 'Tx', T: str('readonly'), Ff: 1, V: str('Locked value'), Rect: [160, 320, 330, 340] })
page.put('Annots', annots)
doc.getTrailer().get('Root').put('AcroForm', { Fields: fields, DA: da, DR: { Font: { Helv: helv } }, NeedAppearances: true })
fs.writeFileSync(process.argv[2], doc.saveToBuffer('').asUint8Array())
console.log('wrote form')
