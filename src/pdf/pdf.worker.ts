// Runs MuPDF off the main thread. Owns the open document; the UI talks to it
// through the request/response protocol in ./protocol.ts.

import * as mupdf from 'mupdf'
import type { OpenResult, PageSize, RenderResult, WorkerRequest, WorkerResponse } from './protocol'

let doc: mupdf.PDFDocument | null = null
const pageCache = new Map<number, mupdf.PDFPage>()

function closeDocument() {
  for (const page of pageCache.values()) page.destroy()
  pageCache.clear()
  doc?.destroy()
  doc = null
}

function loadPage(index: number): mupdf.PDFPage {
  if (!doc) throw new Error('No document is open')
  let page = pageCache.get(index)
  if (!page) {
    page = doc.loadPage(index)
    pageCache.set(index, page)
  }
  return page
}

function describe(): OpenResult {
  if (!doc) throw new Error('No document is open')
  if (doc.needsPassword()) return { needsPassword: true }
  const pages: PageSize[] = []
  for (let i = 0; i < doc.countPages(); i++) {
    const [x0, y0, x1, y1] = loadPage(i).getBounds()
    pages.push({ width: x1 - x0, height: y1 - y0 })
  }
  return { needsPassword: false, pages, title: doc.getMetaData(mupdf.Document.META_INFO_TITLE) || null }
}

function open(data: ArrayBuffer): OpenResult {
  // Keep the current document until the new one has loaded, so a bad file
  // doesn't break what's already on screen.
  const opened = mupdf.Document.openDocument(data, 'application/pdf')
  const pdf = opened.asPDF()
  if (!pdf) {
    opened.destroy()
    throw new Error('This file is not a PDF')
  }
  closeDocument()
  doc = pdf
  return describe()
}

function authenticate(password: string): OpenResult {
  if (!doc) throw new Error('No document is open')
  if (!doc.authenticatePassword(password)) throw new Error('Incorrect password')
  return describe()
}

function render(index: number, scale: number): RenderResult {
  const page = loadPage(index)
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

function save(): Uint8Array<ArrayBuffer> {
  if (!doc) throw new Error('No document is open')
  const buffer = doc.saveToBuffer('garbage,compress')
  try {
    // Copy out of WASM memory so the result can be transferred.
    return new Uint8Array(buffer.asUint8Array())
  } finally {
    buffer.destroy()
  }
}

function handle(req: WorkerRequest): { result: unknown; transfer: Transferable[] } {
  switch (req.type) {
    case 'open':
      return { result: open(req.data), transfer: [] }
    case 'authenticate':
      return { result: authenticate(req.password), transfer: [] }
    case 'render': {
      const result = render(req.page, req.scale)
      return { result, transfer: [result.pixels.buffer] }
    }
    case 'save': {
      const result = save()
      return { result, transfer: [result.buffer] }
    }
  }
}

self.onmessage = (event: MessageEvent<{ id: number; req: WorkerRequest }>) => {
  const { id, req } = event.data
  let response: WorkerResponse
  let transfer: Transferable[] = []
  try {
    const handled = handle(req)
    response = { id, ok: true, result: handled.result }
    transfer = handled.transfer
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(response, { transfer })
}
