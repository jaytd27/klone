import fs from 'node:fs'
import * as mupdf from 'mupdf'
let last
globalThis.self = { postMessage: (m) => { last = m } }
await import(new URL('../../src/pdf/pdf.worker.ts', import.meta.url).href)
let id = 0
const call = (req) => { self.onmessage({ data: { id: ++id, req } }); if (!last.ok) throw new Error(req.type + ': ' + last.error); return last.result }
const data = fs.readFileSync(process.argv[2])
const st = call({ type: 'open', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.length) })
const pg = st.pages[0].id
const style = { color: [0, 0, 0], opacity: 1, width: 1, font: 'Helv', fontSize: 12 }
call({ type: 'createAnnot', page: pg, spec: { kind: 'note', at: [500, 90] }, style })
const notes = call({ type: 'listAnnots', page: pg }); call({ type: 'updateAnnot', page: pg, annot: notes[0].id, patch: { contents: 'secret comment' } })
call({ type: 'createAnnot', page: pg, spec: { kind: 'text', at: [460, 300], text: 'SECRET BOX' }, style })
call({ type: 'createAnnot', page: pg, spec: { kind: 'rect', rect: [20, 700, 80, 760] }, style })  // outside the mark: must survive
call({ type: 'createAnnot', page: pg, spec: { kind: 'redactArea', rect: [150, 60, 600, 440] }, style })
call({ type: 'applyRedactions' })
console.log('annots left:', call({ type: 'listAnnots', page: pg }).map((a) => a.type).join(','), '| fields left:', call({ type: 'listFields', page: pg }).map((f) => f.name).join(','))
const saved = call({ type: 'save' })
const raw = mupdf.Document.openDocument(saved, 'application/pdf').asPDF()
let dump = ''
for (let i = 1; i < raw.countObjects(); i++) { const o = raw.newIndirect(i); dump += o.resolve().toString() + (o.isStream() ? o.readStream().asString() : '') }
for (const secret of ['Ada Lovelace', 'secret comment', 'SECRET BOX', 'Canada', 'Locked value', 'Full name']) console.log(`saved file contains ${JSON.stringify(secret)}:`, dump.includes(secret))
