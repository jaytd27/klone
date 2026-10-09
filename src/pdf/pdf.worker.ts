// Runs MuPDF off the main thread. Owns the open document; the UI talks to it
// through the request/response protocol in ./protocol.ts.

import * as mupdf from 'mupdf'
import type {
  AnnotInfo,
  AnnotPatch,
  AnnotSpec,
  AnnotStyle,
  DocState,
  OpenResult,
  PageInfo,
  Point,
  Quad,
  RenderResult,
  RGB,
  WorkerReady,
  WorkerRequest,
  WorkerResponse,
} from './protocol'

/** Thrown for requests that refer to something that no longer exists. */
class StaleError extends Error {}

let doc: mupdf.PDFDocument | null = null
let journalEnabled = false
/** Journal position of the last save; -1 when it can't be reached by undo/redo. */
let savedPosition = 0
const pageCache = new Map<number, mupdf.PDFPage>()
let idToIndex = new Map<number, number>()
/** Per-page content revisions keyed by page id, plus one for whole-document changes. */
const pageRevs = new Map<number, number>()
let docRev = 0
/** Extracted text per page id, for hit-testing text selections. */
const textCache = new Map<number, mupdf.StructuredText>()

function requireDoc(): mupdf.PDFDocument {
  if (!doc) throw new Error('No document is open')
  return doc
}

function clearPageCache() {
  for (const page of pageCache.values()) page.destroy()
  pageCache.clear()
}

function clearTextCache() {
  for (const text of textCache.values()) text.destroy()
  textCache.clear()
}

function closeDocument() {
  clearPageCache()
  clearTextCache()
  pageRevs.clear()
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
    pages.push({
      id,
      width: x1 - x0,
      height: y1 - y0,
      rotation: rotate.isNumber() ? rotate.asNumber() : 0,
      rev: docRev + (pageRevs.get(id) ?? 0),
    })
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

/**
 * Runs `fn` as one undoable step and returns the new document state.
 * `page` names the only page whose content changes, which keeps cached text
 * for the others; without it the whole document is assumed to change.
 */
function mutate(name: string, fn: (d: mupdf.PDFDocument) => void, page?: number): DocState {
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
    if (page === undefined) {
      clearTextCache()
      docRev++
    } else {
      pageRevs.set(page, (pageRevs.get(page) ?? 0) + 1)
    }
  }
  return state()
}

function indexOf(id: number): number {
  const index = idToIndex.get(id)
  if (index === undefined) throw new StaleError(`Page ${id} no longer exists`)
  return index
}

function render(id: number, scale: number): RenderResult {
  const page = pageById(id)
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

// ---------- Annotations ----------

const ANNOT_TYPES: Record<AnnotSpec['kind'], mupdf.PDFAnnotationType> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'StrikeOut',
  note: 'Text',
  rect: 'Square',
  ellipse: 'Circle',
  line: 'Line',
  arrow: 'Line',
  ink: 'Ink',
}

/** Not listed for editing: popups belong to their parent, links and form fields are separate features. */
const HIDDEN_TYPES = new Set<string>(['Popup', 'Link', 'Widget'])

function toRGB(color: mupdf.AnnotColor): RGB | null {
  switch (color.length) {
    case 1:
      return [color[0], color[0], color[0]]
    case 3:
      return [color[0], color[1], color[2]]
    case 4: {
      const [c, m, y, k] = color
      return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
    }
    default:
      return null
  }
}

function pageById(id: number): mupdf.PDFPage {
  return loadPage(indexOf(id))
}

function findAnnot(page: mupdf.PDFPage, id: number): mupdf.PDFAnnotation {
  const annot = page.getAnnotations().find((a) => a.getObject().asIndirect() === id)
  if (!annot) throw new StaleError(`Annotation ${id} no longer exists`)
  return annot
}

function describeAnnot(annot: mupdf.PDFAnnotation): AnnotInfo {
  const type = annot.getType()
  return {
    id: annot.getObject().asIndirect(),
    type,
    bounds: annot.getBounds(),
    color: toRGB(annot.getColor()),
    opacity: annot.getOpacity(),
    width: annot.hasBorder() && type !== 'Text' ? annot.getBorderWidth() : null,
    contents: annot.getContents(),
  }
}

function listAnnots(pageId: number): AnnotInfo[] {
  return pageById(pageId)
    .getAnnotations()
    .filter((a) => !HIDDEN_TYPES.has(a.getType()))
    .map(describeAnnot)
}

function textQuads(pageId: number, from: Point, to: Point): Quad[] {
  let text = textCache.get(pageId)
  if (!text) {
    text = pageById(pageId).toStructuredText('preserve-whitespace')
    textCache.set(pageId, text)
  }
  return text.highlight(from, to) as Quad[]
}

function normalizeRect([x0, y0, x1, y1]: mupdf.Rect): mupdf.Rect {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
}

function createAnnot(pageId: number, spec: AnnotSpec, style: AnnotStyle): { state: DocState; annot: number } {
  let created = 0
  const state = mutate(
    'Add annotation',
    () => {
      const annot = pageById(pageId).createAnnotation(ANNOT_TYPES[spec.kind])
      annot.setColor(style.color)
      annot.setOpacity(style.opacity)
      switch (spec.kind) {
        case 'highlight':
        case 'underline':
        case 'strikeout':
          annot.setQuadPoints(spec.quads)
          break
        case 'note': {
          const [x, y] = spec.at
          annot.setRect([x - 10, y - 10, x + 10, y + 10])
          annot.setIcon('Comment')
          break
        }
        case 'rect':
        case 'ellipse':
          annot.setRect(normalizeRect(spec.rect))
          annot.setBorderWidth(style.width)
          break
        case 'line':
        case 'arrow':
          annot.setLine(spec.from, spec.to)
          annot.setBorderWidth(style.width)
          if (spec.kind === 'arrow') {
            annot.setLineEndingStyles('None', 'ClosedArrow')
            annot.setInteriorColor(style.color)
          }
          break
        case 'ink':
          annot.setInkList(spec.strokes)
          annot.setBorderWidth(style.width)
          break
      }
      annot.update()
      created = annot.getObject().asIndirect()
    },
    pageId,
  )
  return { state, annot: created }
}

function moveAnnot(annot: mupdf.PDFAnnotation, [dx, dy]: Point) {
  const shift = ([x, y]: mupdf.Point): mupdf.Point => [x + dx, y + dy]
  if (annot.hasInkList()) {
    annot.setInkList(annot.getInkList().map((stroke) => stroke.map(shift)))
  } else if (annot.hasLine()) {
    const [a, b] = annot.getLine()
    annot.setLine(shift(a), shift(b))
  } else if (annot.hasQuadPoints()) {
    annot.setQuadPoints(annot.getQuadPoints().map((q) => q.map((v, i) => v + (i % 2 ? dy : dx)) as mupdf.Quad))
  } else if (annot.hasVertices()) {
    annot.setVertices(annot.getVertices().map(shift))
  } else if (annot.hasRect()) {
    const [x0, y0, x1, y1] = annot.getRect()
    annot.setRect([x0 + dx, y0 + dy, x1 + dx, y1 + dy])
  }
}

function updateAnnot(pageId: number, annotId: number, patch: AnnotPatch): DocState {
  return mutate(
    'Edit annotation',
    () => {
      const annot = findAnnot(pageById(pageId), annotId)
      if (patch.color) {
        annot.setColor(patch.color)
        if (annot.hasLine() && annot.getLineEndingStyles().end !== 'None') annot.setInteriorColor(patch.color)
      }
      if (patch.opacity !== undefined) annot.setOpacity(patch.opacity)
      if (patch.width !== undefined && annot.hasBorder()) annot.setBorderWidth(patch.width)
      if (patch.contents !== undefined) annot.setContents(patch.contents)
      if (patch.offset) moveAnnot(annot, patch.offset)
      annot.update()
    },
    pageId,
  )
}

function deleteAnnot(pageId: number, annotId: number): DocState {
  return mutate(
    'Delete annotation',
    () => {
      const page = pageById(pageId)
      page.deleteAnnotation(findAnnot(page, annotId))
    },
    pageId,
  )
}

function history(direction: 'undo' | 'redo'): DocState {
  const d = requireDoc()
  if (direction === 'undo' ? d.canUndo() : d.canRedo()) {
    if (direction === 'undo') d.undo()
    else d.redo()
    clearPageCache()
    clearTextCache()
    docRev++
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
    case 'listAnnots':
      return { result: listAnnots(req.page) }
    case 'textQuads':
      return { result: textQuads(req.page, req.from, req.to) }
    case 'createAnnot':
      return { result: createAnnot(req.page, req.spec, req.style) }
    case 'updateAnnot':
      return { result: updateAnnot(req.page, req.annot, req.patch) }
    case 'deleteAnnot':
      return { result: deleteAnnot(req.page, req.annot) }
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
