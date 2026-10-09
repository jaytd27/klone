// Runs MuPDF off the main thread. Owns the open document; the UI talks to it
// through the request/response protocol in ./protocol.ts.

import * as mupdf from 'mupdf'
import type { DocState, OpenResult, PageInfo, RenderResult, WorkerReady, WorkerRequest, WorkerResponse } from './protocol'

/** Thrown for requests that refer to something that no longer exists. */
class StaleError extends Error {}

let doc: mupdf.PDFDocument | null = null
let journalEnabled = false
/** Journal position of the last save; -1 when it can't be reached by undo/redo. */
let savedPosition = 0
const pageCache = new Map<number, mupdf.PDFPage>()
let idToIndex = new Map<number, number>()

function requireDoc(): mupdf.PDFDocument {
  if (!doc) throw new Error('No document is open')
  return doc
}

function clearPageCache() {
  for (const page of pageCache.values()) page.destroy()
  pageCache.clear()
}

function closeDocument() {
  clearPageCache()
  idToIndex.clear()
  doc?.destroy()
  doc = null
  journalEnabled = false
}

function loadPage(index: number): mupdf.PDFPage {
  let page = pageCache.get(index)
  if (!page) {
    page = requireDoc().loadPage(index)
    pageCache.set(index, page)
  }
  return page
}

function journalPosition(): number {
  return journalEnabled ? requireDoc().getJournal().position : 0
}

function state(): DocState {
  const d = requireDoc()
  const pages: PageInfo[] = []
  idToIndex = new Map()
  for (let i = 0; i < d.countPages(); i++) {
    const page = loadPage(i)
    const obj = page.getObject()
    const [x0, y0, x1, y1] = page.getBounds()
    const rotate = obj.getInheritable('Rotate')
    const id = obj.asIndirect()
    idToIndex.set(id, i)
    pages.push({ id, width: x1 - x0, height: y1 - y0, rotation: rotate.isNumber() ? rotate.asNumber() : 0 })
  }
  return {
    pages,
    canUndo: journalEnabled && d.canUndo(),
    canRedo: journalEnabled && d.canRedo(),
    dirty: journalPosition() !== savedPosition,
  }
}

function describe(): OpenResult {
  const d = requireDoc()
  if (d.needsPassword()) return { needsPassword: true }
  if (!journalEnabled) {
    d.enableJournal()
    journalEnabled = true
    savedPosition = journalPosition()
  }
  return { needsPassword: false, title: d.getMetaData(mupdf.Document.META_INFO_TITLE) || null, ...state() }
}

function openPdf(data: ArrayBuffer): mupdf.PDFDocument {
  const opened = mupdf.Document.openDocument(data, 'application/pdf')
  const pdf = opened.asPDF()
  if (!pdf) {
    opened.destroy()
    throw new Error('This file is not a PDF')
  }
  return pdf
}

function open(data: ArrayBuffer): OpenResult {
  // Keep the current document until the new one has loaded, so a bad file
  // doesn't break what's already on screen.
  const pdf = openPdf(data)
  closeDocument()
  doc = pdf
  return describe()
}

function authenticate(password: string): OpenResult {
  if (!requireDoc().authenticatePassword(password)) throw new Error('Incorrect password')
  return describe()
}

/** Runs `fn` as one undoable step and returns the new document state. */
function mutate(name: string, fn: (d: mupdf.PDFDocument) => void): DocState {
  const d = requireDoc()
  // A new step after undoing past the save point discards that save point.
  if (d.getJournal().position < savedPosition) savedPosition = -1
  d.beginOperation(name)
  try {
    fn(d)
    d.endOperation()
  } catch (err) {
    d.abandonOperation()
    throw err
  } finally {
    clearPageCache()
  }
  return state()
}

function indexOf(id: number): number {
  const index = idToIndex.get(id)
  if (index === undefined) throw new StaleError(`Page ${id} no longer exists`)
  return index
}

function render(id: number, scale: number): RenderResult {
  const page = loadPage(indexOf(id))
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  try {
    const width = pixmap.getWidth()
    const height = pixmap.getHeight()
    const stride = pixmap.getStride()
    const rgb = pixmap.getPixels()
    // Canvas ImageData wants RGBA; MuPDF gives us opaque RGB rows.
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      let src = y * stride
      let dst = y * width * 4
      for (let x = 0; x < width; x++) {
        rgba[dst++] = rgb[src++]
        rgba[dst++] = rgb[src++]
        rgba[dst++] = rgb[src++]
        rgba[dst++] = 255
      }
    }
    return { width, height, pixels: rgba }
  } finally {
    pixmap.destroy()
  }
}

function toTransferable(buffer: mupdf.Buffer): Uint8Array<ArrayBuffer> {
  try {
    // Copy out of WASM memory so the result can be transferred.
    return new Uint8Array(buffer.asUint8Array())
  } finally {
    buffer.destroy()
  }
}

function save(): Uint8Array<ArrayBuffer> {
  const bytes = toTransferable(requireDoc().saveToBuffer('garbage,compress'))
  savedPosition = journalPosition()
  return bytes
}

function extract(indices: number[]): Uint8Array<ArrayBuffer> {
  const d = requireDoc()
  const out = new mupdf.PDFDocument()
  try {
    const map = out.newGraftMap()
    for (const index of indices) map.graftPage(-1, d, index)
    return toTransferable(out.saveToBuffer('garbage,compress'))
  } finally {
    out.destroy()
  }
}

function rotate(indices: number[], degrees: number): DocState {
  return mutate('Rotate pages', (d) => {
    for (const index of indices) {
      const obj = d.findPage(index)
      const current = obj.getInheritable('Rotate')
      const value = ((((current.isNumber() ? current.asNumber() : 0) + degrees) % 360) + 360) % 360
      obj.put('Rotate', value)
    }
  })
}

function deletePages(indices: number[]): DocState {
  const d = requireDoc()
  const remove = new Set(indices)
  if (remove.size >= d.countPages()) throw new Error('A PDF needs at least one page')
  return mutate('Delete pages', (d) => {
    const keep: number[] = []
    for (let i = 0; i < d.countPages(); i++) if (!remove.has(i)) keep.push(i)
    d.rearrangePages(keep)
  })
}

/** Moves `indices` so they sit together before the page currently at `to`. */
function move(indices: number[], to: number): DocState {
  return mutate('Move pages', (d) => {
    const moving = new Set(indices)
    const rest: number[] = []
    let insertAt = 0
    for (let i = 0; i < d.countPages(); i++) {
      if (moving.has(i)) continue
      if (i < to) insertAt++
      rest.push(i)
    }
    const sortedMoving = [...moving].sort((a, b) => a - b)
    d.rearrangePages([...rest.slice(0, insertAt), ...sortedMoving, ...rest.slice(insertAt)])
  })
}

function insertPdf(data: ArrayBuffer, at: number): DocState {
  const src = openPdf(data)
  try {
    if (src.needsPassword()) throw new Error('Password-protected PDFs can’t be inserted yet')
    return mutate('Insert pages', () => {
      const map = requireDoc().newGraftMap()
      for (let i = 0; i < src.countPages(); i++) map.graftPage(at + i, src, i)
    })
  } finally {
    src.destroy()
  }
}

function insertBlank(at: number, width: number, height: number): DocState {
  return mutate('Insert blank page', (d) => {
    d.insertPage(at, d.addPage([0, 0, width, height], 0, {}, ''))
  })
}

function history(direction: 'undo' | 'redo'): DocState {
  const d = requireDoc()
  if (direction === 'undo' ? d.canUndo() : d.canRedo()) {
    if (direction === 'undo') d.undo()
    else d.redo()
    clearPageCache()
  }
  return state()
}

function handle(req: WorkerRequest): { result: unknown; transfer?: Transferable[] } {
  switch (req.type) {
    case 'open':
      return { result: open(req.data) }
    case 'authenticate':
      return { result: authenticate(req.password) }
    case 'render': {
      const result = render(req.id, req.scale)
      return { result, transfer: [result.pixels.buffer] }
    }
    case 'save': {
      const result = save()
      return { result, transfer: [result.buffer] }
    }
    case 'extract': {
      const result = extract(req.pages)
      return { result, transfer: [result.buffer] }
    }
    case 'rotate':
      return { result: rotate(req.pages, req.degrees) }
    case 'delete':
      return { result: deletePages(req.pages) }
    case 'move':
      return { result: move(req.pages, req.to) }
    case 'insertPdf':
      return { result: insertPdf(req.data, req.at) }
    case 'insertBlank':
      return { result: insertBlank(req.at, req.width, req.height) }
    case 'undo':
    case 'redo':
      return { result: history(req.type) }
  }
}

self.onmessage = (event: MessageEvent<{ id: number; req: WorkerRequest }>) => {
  const { id, req } = event.data
  let response: WorkerResponse
  let transfer: Transferable[] = []
  try {
    const handled = handle(req)
    response = { id, ok: true, result: handled.result }
    transfer = handled.transfer ?? []
  } catch (err) {
    response = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stale: err instanceof StaleError,
    }
  }
  self.postMessage(response, { transfer })
}

// Requests that arrive while MuPDF is still loading can be dropped, so the
// client waits for this before sending anything.
self.postMessage({ ready: true } satisfies WorkerReady)
