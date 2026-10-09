// Message types shared by the main thread and the PDF worker.
//
// All coordinates are in page space as MuPDF reports it: PDF points, origin at
// the top-left of the page as displayed (after rotation), y pointing down.

export type Point = [number, number]
export type Rect = [number, number, number, number]
/** Upper-left, upper-right, lower-left, lower-right corners. */
export type Quad = [number, number, number, number, number, number, number, number]
export type RGB = [number, number, number]

export interface PageInfo {
  /** PDF object number of the page; stable across reordering and undo. */
  id: number
  width: number
  height: number
  rotation: number
  /** Changes whenever the page's rendered content changes. */
  rev: number
}

export interface AnnotStyle {
  color: RGB
  opacity: number
  /** Stroke width in points; ignored by text markup and notes. */
  width: number
}

export type AnnotSpec =
  | { kind: 'highlight' | 'underline' | 'strikeout'; quads: Quad[] }
  | { kind: 'note'; at: Point }
  | { kind: 'rect' | 'ellipse'; rect: Rect }
  | { kind: 'line' | 'arrow'; from: Point; to: Point }
  | { kind: 'ink'; strokes: Point[][] }

export interface AnnotInfo {
  /** PDF object number of the annotation. */
  id: number
  type: string
  bounds: Rect
  color: RGB | null
  opacity: number
  /** Null when the annotation has no stroke width to change. */
  width: number | null
  contents: string
}

export interface AnnotPatch {
  color?: RGB
  opacity?: number
  width?: number
  contents?: string
  /** Moves the annotation by this many points. */
  offset?: Point
}

export interface DocState {
  pages: PageInfo[]
  canUndo: boolean
  canRedo: boolean
  /** True when there are changes since the file was opened or last saved. */
  dirty: boolean
}

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'combo' | 'list' | 'signature' | 'button'

/** One widget (the on-page box) of an AcroForm field. */
export interface FieldInfo {
  /** PDF object number of the widget. */
  id: number
  name: string
  kind: FieldKind
  bounds: Rect
  value: string
  /** Checkboxes and radio buttons: whether this widget is on. */
  checked: boolean
  /** Choice fields: export value and display label of each option. */
  options: { value: string; label: string }[]
  multiline: boolean
  password: boolean
  readOnly: boolean
  /** 0 when unlimited. */
  maxLength: number
  /** Font size in points; 0 means "fit to the field". */
  fontSize: number
}

export type FieldChange = { text: string } | { choice: string } | { toggle: true }

export type WorkerRequest =
  | { type: 'open'; data: ArrayBuffer }
  | { type: 'authenticate'; password: string }
  | { type: 'render'; id: number; scale: number }
  | { type: 'save' }
  | { type: 'extract'; pages: number[] }
  | { type: 'rotate'; pages: number[]; degrees: number }
  | { type: 'delete'; pages: number[] }
  | { type: 'move'; pages: number[]; to: number }
  | { type: 'insertPdf'; data: ArrayBuffer; at: number }
  | { type: 'insertBlank'; at: number; width: number; height: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'listAnnots'; page: number }
  | { type: 'textQuads'; page: number; from: Point; to: Point }
  | { type: 'createAnnot'; page: number; spec: AnnotSpec; style: AnnotStyle }
  | { type: 'updateAnnot'; page: number; annot: number; patch: AnnotPatch }
  | { type: 'deleteAnnot'; page: number; annot: number }
  | { type: 'listFields'; page: number }
  | { type: 'setField'; page: number; widget: number; change: FieldChange }

export type OpenResult = { needsPassword: true } | ({ needsPassword: false; title: string | null } & DocState)

export interface RenderResult {
  width: number
  height: number
  pixels: Uint8ClampedArray<ArrayBuffer>
}

export interface ResultMap {
  open: OpenResult
  authenticate: OpenResult
  render: RenderResult
  save: Uint8Array<ArrayBuffer>
  extract: Uint8Array<ArrayBuffer>
  rotate: DocState
  delete: DocState
  move: DocState
  insertPdf: DocState
  insertBlank: DocState
  undo: DocState
  redo: DocState
  listAnnots: AnnotInfo[]
  textQuads: Quad[]
  createAnnot: { state: DocState; annot: number }
  updateAnnot: DocState
  deleteAnnot: DocState
  listFields: FieldInfo[]
  setField: DocState
}

/** Sent once by the worker when MuPDF has loaded and it can take requests. */
export interface WorkerReady {
  ready: true
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  /** `stale`: the request referred to a page that no longer exists. */
  | { id: number; ok: false; error: string; stale: boolean }
