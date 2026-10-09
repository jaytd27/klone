import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import './App.css'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { VIEWER_PADDING, Viewer, type ViewerHandle } from './components/Viewer'
import { pdf } from './pdf/client'
import type { DocState, OpenResult } from './pdf/protocol'
import { MAX_SCALE, MIN_SCALE, ZOOM_PRESETS, clampScale } from './zoom'

interface OpenDocument extends DocState {
  /** Changes on every open so the viewer starts fresh. */
  key: number
  name: string
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function unlock(result: OpenResult): Promise<DocState | null> {
  let message = 'This PDF is password protected. Enter the password:'
  while (result.needsPassword) {
    const password = window.prompt(message)
    if (password === null) return null
    try {
      result = await pdf.authenticate(password)
    } catch {
      message = 'Incorrect password. Try again:'
    }
  }
  return result
}

function downloadBytes(bytes: Uint8Array<ArrayBuffer>, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Formats sorted zero-based indices as one-based ranges, e.g. "1-3, 5". */
function formatRanges(indices: number[]): string {
  const parts: string[] = []
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i]
    while (i + 1 < indices.length && indices[i + 1] === indices[i] + 1) i++
    parts.push(start === indices[i] ? `${start + 1}` : `${start + 1}-${indices[i] + 1}`)
  }
  return parts.join(', ')
}

const isPdfDrag = (event: DragEvent) => event.dataTransfer.types.includes('Files')

export default function App() {
  const [doc, setDoc] = useState<OpenDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 720)
  const [currentPage, setCurrentPage] = useState(0)
  /** Explicitly picked pages; empty means "the current page". */
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set())
  const [fitWidth, setFitWidth] = useState(true)
  const [customScale, setCustomScale] = useState(1)
  const [viewerWidth, setViewerWidth] = useState(0)
  const viewerRef = useRef<ViewerHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const insertInputRef = useRef<HTMLInputElement>(null)
  /** Guards against overlapping operations computed from stale page indices. */
  const opRunning = useRef(false)
  /** Page to scroll to once the viewer has laid out the next document state. */
  const pendingScroll = useRef<number | null>(null)

  const pages = useMemo(() => doc?.pages ?? [], [doc])
  const widestPage = pages.length ? Math.max(...pages.map((p) => p.width)) : 1
  const fitScale = clampScale((viewerWidth - VIEWER_PADDING * 2) / widestPage)
  const scale = fitWidth && viewerWidth > 0 ? fitScale : customScale

  const selectedIds = useMemo(() => {
    if (pickedIds.size) return pickedIds
    return new Set(pages[currentPage] ? [pages[currentPage].id] : [])
  }, [pickedIds, pages, currentPage])

  const selectedIndices = useMemo(
    () => pages.flatMap((page, index) => (selectedIds.has(page.id) ? [index] : [])),
    [pages, selectedIds],
  )

  useEffect(() => {
    if (pendingScroll.current === null) return
    viewerRef.current?.scrollToPage(pendingScroll.current)
    pendingScroll.current = null
  }, [doc])

  useEffect(() => {
    if (!doc?.dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [doc?.dirty])

  /** Runs one operation at a time, reporting failures in the banner. */
  const run = useCallback(async (what: string, operation: () => Promise<void>) => {
    if (opRunning.current) return
    opRunning.current = true
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (err) {
      setError(`${what}: ${errorMessage(err)}`)
    } finally {
      opRunning.current = false
      setBusy(false)
    }
  }, [])

  const applyState = useCallback((state: DocState, options: { pick?: Set<number>; scrollTo?: number } = {}) => {
    setDoc((prev) => (prev ? { ...prev, ...state } : prev))
    const ids = new Set(state.pages.map((p) => p.id))
    setPickedIds((prev) => options.pick ?? new Set([...prev].filter((id) => ids.has(id))))
    if (options.scrollTo !== undefined) pendingScroll.current = Math.min(options.scrollTo, state.pages.length - 1)
  }, [])

  const openFile = useCallback(
    (file: File) => {
      if (doc?.dirty && !window.confirm(`Discard unsaved changes to ${doc.name}?`)) return
      void run(`Couldn't open ${file.name}`, async () => {
        const state = await unlock(await pdf.open(await file.arrayBuffer()))
        if (!state) {
          // Password prompt cancelled; the worker has already swapped documents.
          setDoc(null)
          document.title = 'Klone'
          return
        }
        setDoc((prev) => ({ ...state, key: (prev?.key ?? 0) + 1, name: file.name }))
        setPickedIds(new Set())
        setCurrentPage(0)
        document.title = `${file.name} – Klone`
      })
    },
    [doc, run],
  )

  const download = useCallback(() => {
    if (!doc) return
    void run("Couldn't save", async () => {
      downloadBytes(await pdf.save(), doc.name)
      setDoc((prev) => (prev ? { ...prev, dirty: false } : prev))
    })
  }, [doc, run])

  const rotate = (degrees: number) =>
    void run("Couldn't rotate", async () => applyState(await pdf.rotate(selectedIndices, degrees)))

  const deleteSelected = () => {
    if (selectedIndices.length >= pages.length) {
      setError('A PDF needs at least one page, so you can’t delete them all.')
      return
    }
    void run("Couldn't delete", async () =>
      applyState(await pdf.deletePages(selectedIndices), { pick: new Set(), scrollTo: selectedIndices[0] }),
    )
  }

  const extract = () => {
    if (!doc) return
    void run("Couldn't extract", async () => {
      const base = doc.name.replace(/\.pdf$/i, '')
      downloadBytes(await pdf.extract(selectedIndices), `${base} (pages ${formatRanges(selectedIndices)}).pdf`)
    })
  }

  const move = (to: number) => {
    const first = selectedIndices[0]
    const last = selectedIndices[selectedIndices.length - 1]
    const contiguous = last - first + 1 === selectedIndices.length
    if (contiguous && to >= first && to <= last + 1) return
    const landing = to - selectedIndices.filter((i) => i < to).length
    void run("Couldn't move pages", async () =>
      applyState(await pdf.move(selectedIndices, to), { pick: new Set(selectedIds), scrollTo: landing }),
    )
  }

  /** Index just after the selection, where new pages go. */
  const insertionPoint = () => (selectedIndices.length ? selectedIndices[selectedIndices.length - 1] + 1 : pages.length)

  const insertBlank = () => {
    const at = insertionPoint()
    const like = pages[at - 1] ?? pages[0]
    void run("Couldn't insert a page", async () => {
      const state = await pdf.insertBlank(at, like.width, like.height)
      applyState(state, { pick: new Set([state.pages[at].id]), scrollTo: at })
    })
  }

  const insertFiles = (files: File[], at: number) => {
    void run("Couldn't insert pages", async () => {
      const before = new Set(pages.map((p) => p.id))
      let state: DocState | null = null
      let position = at
      for (const file of files) {
        const count = state?.pages.length ?? pages.length
        try {
          state = await pdf.insertPdf(await file.arrayBuffer(), position)
        } catch (err) {
          throw new Error(`${file.name}: ${errorMessage(err)}`)
        }
        position += state.pages.length - count
      }
      if (state) {
        const added = new Set(state.pages.filter((p) => !before.has(p.id)).map((p) => p.id))
        applyState(state, { pick: added, scrollTo: at })
      }
    })
  }

  const history = useCallback(
    (direction: 'undo' | 'redo') =>
      void run(`Couldn't ${direction}`, async () => applyState(await (direction === 'undo' ? pdf.undo() : pdf.redo()))),
    [run, applyState],
  )

  const setZoom = useCallback((value: number | 'fit') => {
    if (value === 'fit') {
      setFitWidth(true)
    } else {
      setFitWidth(false)
      setCustomScale(clampScale(value))
    }
  }, [])

  const zoomBy = useCallback((factor: number) => setZoom(scale * factor), [scale, setZoom])

  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      const next =
        direction > 0
          ? ZOOM_PRESETS.find((z) => z > scale + 0.001) ?? MAX_SCALE
          : [...ZOOM_PRESETS].reverse().find((z) => z < scale - 0.001) ?? MIN_SCALE
      setZoom(next)
    },
    [scale, setZoom],
  )

  const goToPage = useCallback(
    (index: number) => {
      if (!pages.length) return
      viewerRef.current?.scrollToPage(Math.min(Math.max(index, 0), pages.length - 1))
    },
    [pages],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      const inField = event.target instanceof HTMLElement && event.target.matches('input, textarea, select')
      if (key === 'o') fileInputRef.current?.click()
      else if (!doc) return
      else if (key === 's') download()
      else if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (inField) return
        history('redo')
      } else if (key === 'z') {
        if (inField) return
        history('undo')
      } else if (key === '=' || key === '+') zoomStep(1)
      else if (key === '-') zoomStep(-1)
      else if (key === '0') setZoom('fit')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doc, download, history, zoomStep, setZoom])

  return (
    <div
      className="app"
      onDragOver={(e) => {
        // The sidebar handles its own drops (inserting pages).
        if (e.defaultPrevented || !isPdfDrag(e)) {
          setDragging(false)
          return
        }
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        setDragging(false)
        if (e.defaultPrevented || !isPdfDrag(e)) return
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) openFile(file)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) openFile(file)
          e.target.value = ''
        }}
      />
      <input
        ref={insertInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          if (files.length) insertFiles(files, insertionPoint())
          e.target.value = ''
        }}
      />

      <Toolbar
        fileName={doc ? `${doc.name}${doc.dirty ? ' •' : ''}` : null}
        pageCount={pages.length}
        currentPage={currentPage}
        scale={scale}
        fitWidth={fitWidth}
        sidebarOpen={sidebarOpen}
        busy={busy}
        canUndo={doc?.canUndo ?? false}
        canRedo={doc?.canRedo ?? false}
        onOpen={() => fileInputRef.current?.click()}
        onUndo={() => history('undo')}
        onRedo={() => history('redo')}
        onDownload={download}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onGoToPage={goToPage}
        onZoomIn={() => zoomStep(1)}
        onZoomOut={() => zoomStep(-1)}
        onSetZoom={setZoom}
      />

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button className="banner__close" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <main className="workspace">
        {doc ? (
          <>
            {sidebarOpen && (
              <Sidebar
                key={`sidebar-${doc.key}`}
                pages={pages}
                currentPage={currentPage}
                selected={selectedIds}
                busy={busy}
                onSelectionChange={setPickedIds}
                onNavigate={goToPage}
                onRotate={rotate}
                onDelete={deleteSelected}
                onExtract={extract}
                onInsertBlank={insertBlank}
                onInsertFromFile={() => insertInputRef.current?.click()}
                onMove={move}
                onDropFiles={insertFiles}
              />
            )}
            <Viewer
              key={`viewer-${doc.key}`}
              ref={viewerRef}
              pages={pages}
              scale={scale}
              onCurrentPageChange={setCurrentPage}
              onWidthChange={setViewerWidth}
              onZoom={zoomBy}
            />
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state__card">
              <h1>Open a PDF to get started</h1>
              <p>Drop a file anywhere in this window, or choose one from your computer. Files stay on your device.</p>
              <button className="button button--primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                {busy ? 'Opening…' : 'Choose a PDF'}
              </button>
            </div>
          </div>
        )}
      </main>

      {dragging && (
        <div className="drop-overlay">
          {doc ? 'Drop to open instead — or drop on the thumbnails to insert pages' : 'Drop to open'}
        </div>
      )}
    </div>
  )
}
