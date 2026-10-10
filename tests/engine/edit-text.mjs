import fs from 'node:fs'
import * as mupdf from 'mupdf'
let last
globalThis.self = { postMessage: (m) => { last = m } }
await import(new URL('../../src/pdf/pdf.worker.ts', import.meta.url).href)
let id = 0
const call = (req) => { self.onmessage({ data: { id: ++id, req } }); if (!last.ok) throw new Error(req.type + ': ' + last.error); return last.result }
const data = fs.readFileSync(process.argv[2])
const st = call({ type: 'open', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.length) })
const [p1, p2] = st.pages.map((p) => p.id)
call({ type: 'rotate', pages: [1], degrees: 90 })
let lines = call({ type: 'textLines', page: p1 })
console.log(lines.map((l) => `${JSON.stringify(l.text)} size=${l.size} font=${l.font.name}/${l.font.family}${l.font.bold ? '/b' : ''} color=${l.color.map((c) => c.toFixed(1))} dir=${l.dir}`).join('\n'))
call({ type: 'replaceTextLine', page: p1, line: lines[2], text: 'The quick RED fox leaps over the sleepy cat.' })
lines = call({ type: 'textLines', page: p1 })
call({ type: 'replaceTextLine', page: p1, line: lines.find((l) => l.text.startsWith('Kwoon')), text: 'Edited heading ✓ Ünïcödé' })
lines = call({ type: 'textLines', page: p1 })
call({ type: 'replaceTextLine', page: p1, line: lines.find((l) => l.text.startsWith('Page size')), text: '' })
console.log('p1 after edits:', JSON.stringify(call({ type: 'textLines', page: p1 }).map((l) => l.text)))
const r = call({ type: 'textLines', page: p2 })
console.log('rotated p2 lines:', r.map((l) => `${l.text.slice(0, 20)} dir=${l.dir.map((v) => Math.round(v))}`).join(' | '))
call({ type: 'replaceTextLine', page: p2, line: r.find((l) => l.text.startsWith('The quick')), text: 'Rotated page line edited' })
console.log('p2 after edit:', JSON.stringify(call({ type: 'textLines', page: p2 }).map((l) => l.text)))
const saved = call({ type: 'save' })
const d = mupdf.Document.openDocument(saved, 'application/pdf').asPDF()
for (let i = 0; i < 2; i++) fs.writeFileSync(`${process.argv[3]}-p${i + 1}.png`, d.loadPage(i).toPixmap(mupdf.Matrix.scale(0.7, 0.7), mupdf.ColorSpace.DeviceRGB, false, true).asPNG())
const c = d.findPage(0).get('Contents'); let all = ''; (c.isArray() ? [...Array(c.length).keys()].map((i) => c.get(i)) : [c]).forEach((s) => (all += s.readStream().asString() + '\n'))
console.log('p1 content streams:', c.isArray() ? c.length : 1, '| max q depth:', all.split(/\s+/).reduce((acc, t) => { if (t === 'q') acc.d++; if (t === 'Q') acc.d--; acc.m = Math.max(acc.m, acc.d); return acc }, { d: 0, m: 0 }).m)
call({ type: 'undo' }); call({ type: 'undo' }); call({ type: 'undo' }); call({ type: 'undo' })
console.log('after 4 undos p1:', JSON.stringify(call({ type: 'textLines', page: p1 }).map((l) => l.text)))
