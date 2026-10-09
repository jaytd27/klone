// Message types shared by the main thread and the PDF worker.

export interface PageSize {
  width: number
  height: number
}

export type WorkerRequest =
  | { type: 'open'; data: ArrayBuffer }
  | { type: 'authenticate'; password: string }
  | { type: 'render'; page: number; scale: number }
  | { type: 'save' }

export type OpenResult =
  | { needsPassword: true }
  | { needsPassword: false; pages: PageSize[]; title: string | null }

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
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
