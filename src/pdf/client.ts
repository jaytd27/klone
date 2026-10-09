// Promise-based wrapper around the PDF worker.
//
// Render requests go through a local queue so only one is in the worker at a
// time. The newest request is served first (it is most likely on screen), and
// requests whose AbortSignal fires before they are sent are dropped, so fast
// scrolling doesn't leave a backlog of pages nobody is looking at.

import type { OpenResult, RenderResult, ResultMap, WorkerRequest, WorkerResponse } from './protocol'

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface QueuedRender {
  page: number
  scale: number
  signal?: AbortSignal
  resolve: (value: RenderResult) => void
  reject: (reason: unknown) => void
}

function abortError() {
  return new DOMException('Render cancelled', 'AbortError')
}

export class PdfClient {
  private worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  private nextId = 1
  private pending = new Map<number, Pending>()
  private renderQueue: QueuedRender[] = []
  private renderInFlight = false

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      if (msg.ok) entry.resolve(msg.result)
      else entry.reject(new Error(msg.error))
    }
  }

  private send<T extends WorkerRequest>(req: T, transfer: Transferable[] = []): Promise<ResultMap[T['type']]> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.worker.postMessage({ id, req }, transfer)
    })
  }

  open(data: ArrayBuffer): Promise<OpenResult> {
    for (const job of this.renderQueue) job.reject(abortError())
    this.renderQueue = []
    return this.send({ type: 'open', data }, [data])
  }

  authenticate(password: string): Promise<OpenResult> {
    return this.send({ type: 'authenticate', password })
  }

  save(): Promise<Uint8Array<ArrayBuffer>> {
    return this.send({ type: 'save' })
  }

  render(page: number, scale: number, signal?: AbortSignal): Promise<RenderResult> {
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise((resolve, reject) => {
      this.renderQueue.push({ page, scale, signal, resolve, reject })
      this.pumpRenders()
    })
  }

  private pumpRenders() {
    if (this.renderInFlight) return
    let job: QueuedRender | undefined
    while ((job = this.renderQueue.pop())) {
      if (!job.signal?.aborted) break
      job.reject(abortError())
    }
    if (!job) return
    const current = job
    this.renderInFlight = true
    this.send({ type: 'render', page: current.page, scale: current.scale })
      .then(
        (result) => (current.signal?.aborted ? current.reject(abortError()) : current.resolve(result)),
        current.reject,
      )
      .finally(() => {
        this.renderInFlight = false
        this.pumpRenders()
      })
  }
}

export const pdf = new PdfClient()
