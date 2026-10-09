// Runs MuPDF off the main thread. Owns the open document; the UI talks to it
// through the request/response protocol in ./protocol.ts.

import * as mupdf from 'mupdf'
import type {
  AnnotInfo,
  AnnotPatch,
  AnnotSpec,
  AnnotStyle,
  DocState,
  FieldChange,
  FieldInfo,
  FieldKind,
  OpenResult,
  PageInfo,
  Point,
  Quad,
  RenderResult,
  ImagePayload,
  RGB,
  TextFont,
  WatermarkSpec,
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
 * What a change can affect: one page's look (a page id), every page's look
 * but no text ('appearance', e.g. form fields that span pages), or anything
 * ('document', the default).
 */
type ChangeScope = number | 'appearance' | 'document'

/** Runs `fn` as one undoable step and returns the new document state. */
function mutate(name: string, fn: (d: mupdf.PDFDocument) => void, scope: ChangeScope = 'document'): DocState {
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
    if (typeof scope === 'number') {
      pageRevs.set(scope, (pageRevs.get(scope) ?? 0) + 1)
    } else {
      if (scope === 'document') clearTextCache()
      docRev++
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
  text: 'FreeText',
  image: 'Stamp',
}

/** Not listed for editing: popups belong to their parent, links and form fields are separate features. */
const HIDDEN_TYPES = new Set<string>(['Popup', 'Link', 'Widget'])

const TEXT_FONTS: Record<TextFont, string> = { Helv: 'Helvetica', TiRo: 'Times-Roman', Cour: 'Courier' }
const DEFAULT_FONT_SIZE = 14
/** Padding MuPDF leaves around text inside a text box, in points. */
const TEXT_PADDING = 4
const metricFonts = new Map<string, mupdf.Font>()

function toTextFont(name: string): TextFont {
  return name in TEXT_FONTS ? (name as TextFont) : 'Helv'
}

/** Width of `text` in points, using the font's glyph metrics. */
function textWidth(font: TextFont, size: number, text: string): number {
  let metrics = metricFonts.get(font)
  if (!metrics) {
    metrics = new mupdf.Font(TEXT_FONTS[font])
    metricFonts.set(font, metrics)
  }
  let width = 0
  for (const ch of text) width += metrics.advanceGlyph(metrics.encodeCharacter(ch))
  return width * size
}

/** Sizes a text box to fit its text, keeping its top-left corner at `origin`. */
function fitTextBox(annot: mupdf.PDFAnnotation, text: string, font: TextFont, size: number, [x, y]: Point) {
  const lines = text.split('\n')
  const width = Math.max(...lines.map((line) => textWidth(font, size, line)), size)
  annot.setRect([x, y, x + width + TEXT_PADDING * 2, y + lines.length * size * 1.2 + TEXT_PADDING * 2])
}

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
  const info: AnnotInfo = {
    id: annot.getObject().asIndirect(),
    type,
    bounds: annot.getBounds(),
    rect: annot.hasRect() ? annot.getRect() : null,
    color: toRGB(annot.getColor()),
    opacity: annot.getOpacity(),
    width: annot.hasBorder() && type !== 'Text' && type !== 'FreeText' ? annot.getBorderWidth() : null,
    contents: annot.getContents(),
    font: null,
    fontSize: null,
  }
  if (type === 'FreeText') {
    // A text box's text color lives in its default appearance, not /C.
    const da = annot.getDefaultAppearance()
    info.color = toRGB(da.color) ?? [0, 0, 0]
    info.font = toTextFont(da.font)
    info.fontSize = da.size || DEFAULT_FONT_SIZE
  }
  if (type === 'Stamp') info.color = null
  return info
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

/** Builds an image, keeping transparency as a separate soft mask. */
function buildImage(payload: ImagePayload): mupdf.Image {
  if ('jpeg' in payload) return new mupdf.Image(payload.jpeg)
  const { width, height } = payload
  const rgba = new Uint8ClampedArray(payload.rgba)
  const bbox: mupdf.Rect = [0, 0, width, height]
  const color = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false)
  const alpha = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, bbox, false)
  const colorPixels = color.getPixels()
  const alphaPixels = alpha.getPixels()
  const colorStride = color.getStride()
  const alphaStride = alpha.getStride()
  let opaque = true
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = y * colorStride + x * 3
      colorPixels[dst] = rgba[src]
      colorPixels[dst + 1] = rgba[src + 1]
      colorPixels[dst + 2] = rgba[src + 2]
      alphaPixels[y * alphaStride + x] = rgba[src + 3]
      if (rgba[src + 3] !== 255) opaque = false
    }
  }
  if (opaque) {
    alpha.destroy()
    return new mupdf.Image(color)
  }
  return new mupdf.Image(color, new mupdf.Image(alpha))
}

function createAnnot(pageId: number, spec: AnnotSpec, style: AnnotStyle): { state: DocState; annot: number } {
  let created = 0
  const state = mutate(
    'Add annotation',
    () => {
      const annot = pageById(pageId).createAnnotation(ANNOT_TYPES[spec.kind])
      annot.setOpacity(style.opacity)
      switch (spec.kind) {
        case 'highlight':
        case 'underline':
        case 'strikeout':
          annot.setColor(style.color)
          annot.setQuadPoints(spec.quads)
          break
        case 'note': {
          const [x, y] = spec.at
          annot.setColor(style.color)
          annot.setRect([x - 10, y - 10, x + 10, y + 10])
          annot.setIcon('Comment')
          break
        }
        case 'rect':
        case 'ellipse':
          annot.setColor(style.color)
          annot.setRect(normalizeRect(spec.rect))
          annot.setBorderWidth(style.width)
          break
        case 'line':
        case 'arrow':
          annot.setColor(style.color)
          annot.setLine(spec.from, spec.to)
          annot.setBorderWidth(style.width)
          if (spec.kind === 'arrow') {
            annot.setLineEndingStyles('None', 'ClosedArrow')
            annot.setInteriorColor(style.color)
          }
          break
        case 'ink':
          annot.setColor(style.color)
          annot.setInkList(spec.strokes)
          annot.setBorderWidth(style.width)
          break
        case 'text': {
          const font = style.font ?? 'Helv'
          const size = style.fontSize ?? DEFAULT_FONT_SIZE
          annot.setDefaultAppearance(font, size, style.color)
          annot.setContents(spec.text)
          fitTextBox(annot, spec.text, font, size, spec.at)
          break
        }
        case 'image': {
          const image = buildImage(spec.image)
          try {
            annot.setRect(normalizeRect(spec.rect))
            annot.setIntent('StampImage')
            annot.setStampImage(image)
          } finally {
            image.destroy()
          }
          break
        }
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
      if (annot.getType() === 'FreeText') {
        const da = annot.getDefaultAppearance()
        const font = patch.font ?? toTextFont(da.font)
        const size = patch.fontSize ?? (da.size || DEFAULT_FONT_SIZE)
        if (patch.color || patch.font || patch.fontSize) annot.setDefaultAppearance(font, size, patch.color ?? da.color)
        if (patch.contents !== undefined) annot.setContents(patch.contents)
        if (patch.contents !== undefined || patch.font || patch.fontSize) {
          const [x, y] = annot.getRect()
          fitTextBox(annot, annot.getContents(), font, size, [x, y])
        }
      } else {
        if (patch.color) {
          annot.setColor(patch.color)
          if (annot.hasLine() && annot.getLineEndingStyles().end !== 'None') annot.setInteriorColor(patch.color)
        }
        if (patch.contents !== undefined) annot.setContents(patch.contents)
      }
      if (patch.opacity !== undefined) annot.setOpacity(patch.opacity)
      if (patch.width !== undefined && annot.hasBorder()) annot.setBorderWidth(patch.width)
      if (patch.offset) moveAnnot(annot, patch.offset)
      if (patch.rect && annot.hasRect()) annot.setRect(normalizeRect(patch.rect))
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

// ---------- Watermarks ----------

/** Returns `base`, or `base` with a number added, that isn't yet a key of `dict`. */
function unusedKey(dict: mupdf.PDFObject, base: string): string {
  let key = base
  for (let n = 2; !dict.get(key).isNull(); n++) key = `${base}${n}`
  return key
}

/** Gets (creating if needed) the sub-dictionary `name` of a resources dictionary. */
function resourceDict(d: mupdf.PDFDocument, resources: mupdf.PDFObject, name: string): mupdf.PDFObject {
  let dict = resources.get(name)
  if (dict.isNull()) {
    dict = d.newDictionary()
    resources.put(name, dict)
  }
  return dict
}

/** PDF literal string in WinAnsi (Latin-1) encoding; other characters become '?'. */
function pdfString(text: string): string {
  let out = '('
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch
    else if (code >= 32 && code < 256) out += code < 127 ? ch : '\\' + code.toString(8).padStart(3, '0')
    else out += '?'
  }
  return out + ')'
}

const num = (n: number) => (Math.abs(n) < 1e-6 ? '0' : n.toFixed(4).replace(/\.?0+$/, ''))

/** Writes `spec` into the content of each page, centred and on top of everything else. */
function addWatermark(indices: number[], spec: WatermarkSpec): DocState {
  return mutate('Add watermark', (d) => {
    const font = d.addSimpleFont(new mupdf.Font('Helvetica'))
    const state = d.addObject({ Type: 'ExtGState', ca: spec.opacity, CA: spec.opacity })
    const width = textWidth('Helv', spec.fontSize, spec.text)
    for (const index of indices) {
      const page = d.findPage(index)
      let resources = page.getInheritable('Resources')
      if (resources.isNull()) {
        resources = d.newDictionary()
        page.put('Resources', resources)
      }
      const fonts = resourceDict(d, resources, 'Font')
      const states = resourceDict(d, resources, 'ExtGState')
      const fontKey = unusedKey(fonts, 'KloneWM')
      const stateKey = unusedKey(states, 'KloneWMGS')
      fonts.put(fontKey, font)
      states.put(stateKey, state)

      // Centre on the visible area; the page's /Rotate turns the content
      // clockwise for display, so add it to get the angle the reader sees.
      const box = page.getInheritable('CropBox').isNull() ? page.getInheritable('MediaBox') : page.getInheritable('CropBox')
      const [x0, y0, x1, y1] = [0, 1, 2, 3].map((i) => box.get(i).asNumber())
      const rotate = page.getInheritable('Rotate')
      const radians = ((spec.angle + (rotate.isNumber() ? rotate.asNumber() : 0)) * Math.PI) / 180
      const [cos, sin] = [Math.cos(radians), Math.sin(radians)]
      const [r, g, b] = spec.color
      const content =
        `q /${stateKey} gs ${num(r)} ${num(g)} ${num(b)} rg BT /${fontKey} ${num(spec.fontSize)} Tf ` +
        `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num((x0 + x1) / 2)} ${num((y0 + y1) / 2)} Tm ` +
        `${num(-width / 2)} ${num(-spec.fontSize * 0.35)} Td ${pdfString(spec.text)} Tj ET Q`

      // Wrap the existing content in q/Q so state it leaves behind can't
      // move or recolor the watermark.
      const existing = page.get('Contents')
      const contents = d.newArray()
      contents.push(d.addStream('q', {}))
      if (existing.isArray()) existing.forEach((stream) => contents.push(stream))
      else if (!existing.isNull()) contents.push(existing)
      contents.push(d.addStream('Q', {}))
      contents.push(d.addStream(content, {}))
      page.put('Contents', contents)
    }
  })
}

// ---------- Form fields ----------

function fieldKind(widget: mupdf.PDFWidget): FieldKind {
  switch (widget.getFieldType()) {
    case 'text':
      return 'text'
    case 'checkbox':
      return 'checkbox'
    case 'radiobutton':
      return 'radio'
    case 'combobox':
      return 'combo'
    case 'listbox':
      return 'list'
    case 'signature':
      return 'signature'
    default:
      return 'button'
  }
}

function describeField(widget: mupdf.PDFWidget): FieldInfo {
  const kind = fieldKind(widget)
  const obj = widget.getObject()
  const state = obj.get('AS')
  let options: FieldInfo['options'] = []
  if (kind === 'combo' || kind === 'list') {
    const labels = widget.getOptions()
    const values = widget.getOptions(true)
    options = labels.map((label, i) => ({ value: values[i] || label, label }))
  }
  return {
    id: obj.asIndirect(),
    name: widget.getName(),
    kind,
    bounds: widget.getBounds(),
    value: widget.getValue(),
    checked: state.isName() && state.asName() !== 'Off',
    options,
    multiline: kind === 'text' && widget.isMultiline(),
    password: kind === 'text' && widget.isPassword(),
    readOnly: widget.isReadOnly(),
    maxLength: kind === 'text' ? widget.getMaxLen() : 0,
    fontSize: widget.getDefaultAppearance().size,
  }
}

function listFields(pageId: number): FieldInfo[] {
  return pageById(pageId).getWidgets().map(describeField)
}

function setField(pageId: number, widgetId: number, change: FieldChange): DocState {
  // A field can have widgets on several pages, so redraw them all.
  return mutate(
    'Fill in form',
    () => {
      const widget = pageById(pageId)
        .getWidgets()
        .find((w) => w.getObject().asIndirect() === widgetId)
      if (!widget) throw new StaleError(`Form field ${widgetId} no longer exists`)
      if (widget.isReadOnly()) throw new Error('This field is read-only')
      if ('text' in change) widget.setTextValue(change.text)
      else if ('choice' in change) widget.setChoiceValue(change.choice)
      else widget.toggle()
      widget.update()
    },
    'appearance',
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
    case 'listFields':
      return { result: listFields(req.page) }
    case 'setField':
      return { result: setField(req.page, req.widget, req.change) }
    case 'watermark':
      return { result: addWatermark(req.pages, req.spec) }
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
