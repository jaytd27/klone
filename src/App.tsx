import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import './App.css'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { VIEWER_PADDING, Viewer, type ViewerHandle } from './components/Viewer'
import { pdf } from './pdf/client'
import type { OpenResult, PageSize } from './pdf/protocol'
import { MAX_SCALE, MIN_SCALE, ZOOM_PRESETS, clampScale } from './zoom'

interface OpenDocument {
  /** Changes on every open so the viewer starts fresh. */
  key: number
  name: string
  pages: PageSize[]
}

async function unlock(result: OpenResult): Promise<PageSize[] | null> {
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
  return result.pages
}

export default function App() {
  const [doc, setDoc] = useState<OpenDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 720)
  const [currentPage, setCurrentPage] = useState(0)
  const [fitWidth, setFitWidth] = useState(true)
  const [customScale, setCustomScale] = useState(1)
  const [viewerWidth, setViewerWidth] = useState(0)
  const viewerRef = useRef<ViewerHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const widestPage = doc ? Math.max(...doc.pages.map((p) => p.width)) : 1
  const fitScale = clampScale((viewerWidth - VIEWER_PADDING * 2) / widestPage)
  const scale = fitWidth && viewerWidth > 0 ? fitScale : customScale

  const openFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const pages = await unlock(await pdf.open(await file.arrayBuffer()))
      if (!pages) {
        // Password prompt cancelled; the worker has already swapped documents.
        setDoc(null)
        document.title = 'Klone'
        return
      }
      setDoc((prev) => ({ key: (prev?.key ?? 0) + 1, name: file.name, pages }))
      setCurrentPage(0)
      document.title = `${file.name} – Klone`
    } catch (err) {
      setError(`Couldn't open ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const download = useCallback(async () => {
    if (!doc) return
    setBusy(true)
    try {
      const bytes = await pdf.save()
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = doc.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [doc])

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
      if (!doc) return
      const clamped = Math.min(Math.max(index, 0), doc.pages.length - 1)
      viewerRef.current?.scrollToPage(clamped)
    },
    [doc],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'o') fileInputRef.current?.click()
      else if (key === 's' && doc) void download()
      else if ((key === '=' || key === '+') && doc) zoomStep(1)
      else if (key === '-' && doc) zoomStep(-1)
      else if (key === '0' && doc) setZoom('fit')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doc, download, zoomStep, setZoom])

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void openFile(file)
  }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void openFile(file)
          e.target.value = ''
        }}
      />

      <Toolbar
        fileName={doc?.name ?? null}
        pageCount={doc?.pages.length ?? 0}
        currentPage={currentPage}
        scale={scale}
        fitWidth={fitWidth}
        sidebarOpen={sidebarOpen}
        busy={busy}
        onOpen={() => fileInputRef.current?.click()}
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
              <Sidebar key={`sidebar-${doc.key}`} pages={doc.pages} currentPage={currentPage} onSelectPage={goToPage} />
            )}
            <Viewer
              key={`viewer-${doc.key}`}
              ref={viewerRef}
              pages={doc.pages}
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

      {dragging && <div className="drop-overlay">Drop to open</div>}
    </div>
  )
}
