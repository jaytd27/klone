// Message types shared by the main thread and the PDF worker.

export interface PageInfo {
  /** PDF object number of the page; stable across reordering and undo. */
  id: number
  width: number
  height: number
  rotation: number
}

export interface DocState {
  pages: PageInfo[]
  canUndo: boolean
  canRedo: boolean
  /** True when there are changes since the file was opened or last saved. */
  dirty: boolean
}

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
}

/** Sent once by the worker when MuPDF has loaded and it can take requests. */
export interface WorkerReady {
  ready: true
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  /** `stale`: the request referred to a page that no longer exists. */
  | { id: number; ok: false; error: string; stale: boolean }
