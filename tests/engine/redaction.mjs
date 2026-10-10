import fs from 'node:fs'
import * as mupdf from 'mupdf'
let last
globalThis.self = { postMessage: (m) => { last = m } }
await import(new URL('../../src/pdf/pdf.worker.ts', import.meta.url).href)
let id = 0
const call = (req) => { self.onmessage({ data: { id: ++id, req } }); if (!last.ok) throw new Error(req.type + ': ' + last.error); return last.result }
const data = fs.readFileSync(process.argv[2])
const st = call({ type: 'open', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.length) })
console.log('open redactions', st.redactions)
console.log('search "lazy dog" hits', call({ type: 'search', query: 'lazy dog' }).length, '| search "LAZY" (case)', call({ type: 'search', query: 'LAZY' }).length)
const marked = call({ type: 'markRedactions', query: 'lazy dog' })
console.log('marked', marked.count, 'state.redactions', marked.state.redactions)
const area = call({ type: 'createAnnot', page: st.pages[0].id, spec: { kind: 'redactArea', rect: [40, 40, 300, 120] }, style: { color: [0, 0, 0], opacity: 1, width: 0 } })
console.log('after area', area.state.redactions, 'listed as', call({ type: 'listAnnots', page: st.pages[0].id }).map((a) => `${a.type}:${a.color}`).join(','))
const applied = call({ type: 'applyRedactions' })
console.log('applied redactions left', applied.redactions, 'search "lazy dog" now', call({ type: 'search', query: 'lazy dog' }).length)
const saved = call({ type: 'save' })
const d = mupdf.Document.openDocument(saved, 'application/pdf')
let text = ''; for (let i = 0; i < d.countPages(); i++) text += d.loadPage(i).toStructuredText().asText()
console.log('saved file text contains "lazy"?', text.includes('lazy'), '| still has "quick"?', text.includes('quick'))
const undone = call({ type: 'undo' })
console.log('undo -> redactions', undone.redactions, 'search "lazy dog"', call({ type: 'search', query: 'lazy dog' }).length)
