import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import './App.css'
import { AnnotationContext, type AnnotationController, type AnnotSelection } from './annotations/context'
import { DEFAULT_STYLES, type DrawingTool, type Tool } from './annotations/tools'
import { AnnotationBar } from './components/AnnotationBar'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { VIEWER_PADDING, Viewer, type ViewerHandle } from './components/Viewer'
import { ApplyRedactionsDialog, FindRedactDialog, UnappliedRedactionsDialog } from './components/RedactionDialogs'
import { SignatureDialog } from './components/SignatureDialog'
import { WatermarkDialog, type WatermarkPages } from './components/WatermarkDialog'
import { loadImage } from './images'
import { pdf } from './pdf/client'
import type { AnnotInfo, AnnotPatch, AnnotSpec, AnnotStyle, DocState, FieldChange, OpenResult, Rect, WatermarkSpec } from './pdf/protocol'
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
  const [tool, setTool] = useState<Tool>('select')
  const [toolStyles, setToolStyles] = useState<Record<DrawingTool, AnnotStyle>>(DEFAULT_STYLES)
  const [annotSelection, setAnnotSelection] = useState<AnnotSelection | null>(null)
  const [focusComment, setFocusComment] = useState(false)
  const viewerRef = useRef<ViewerHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const insertInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [dialog, setDialog] = useState<'signature' | 'watermark' | 'findRedact' | 'applyRedact' | 'downloadRedact' | null>(null)
  /** Guards against overlapping operations computed from stale page indices. */
  const opRunning = useRef(false)
  /**
   * Form edits run in order on their own chain rather than through `run`, so
   * tabbing quickly between fields never drops a value.
   */
  const formQueue = useRef<Promise<void>>(Promise.resolve())
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
    setAnnotSelection((prev) => (prev && ids.has(prev.pageId) ? prev : null))
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
        setAnnotSelection(null)
        setCurrentPage(0)
        document.title = `${file.name} – Klone`
      })
    },
    [doc, run],
  )

  /** Saves and downloads; `applyRedactionsFirst` applies pending redaction marks in the same step. */
  const saveFile = useCallback(
    (applyRedactionsFirst = false) => {
      if (!doc) return
      setDialog(null)
      void run("Couldn't save", async () => {
        if (applyRedactionsFirst) {
          applyState(await pdf.applyRedactions())
          setAnnotSelection(null)
        }
        downloadBytes(await pdf.save(), doc.name)
        setDoc((prev) => (prev ? { ...prev, dirty: false } : prev))
      })
    },
    [doc, run, applyState],
  )

  const download = useCallback(() => {
    if (!doc) return
    // Marks alone hide nothing: make sure that's a deliberate choice.
    if (doc.redactions > 0) setDialog('downloadRedact')
    else saveFile()
  }, [doc, saveFile])

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

  // ---------- Annotations ----------

  const toolStyle = toolStyles[tool === 'select' ? 'rect' : tool]

  const changeTool = useCallback((next: Tool) => {
    setTool(next)
    setAnnotSelection(null)
  }, [])

  const selectAnnot = useCallback((pageId: number, annot: AnnotInfo | null) => {
    setAnnotSelection(annot ? { pageId, annotId: annot.id, info: annot } : null)
    setFocusComment(false)
  }, [])

  const syncAnnotations = useCallback((pageId: number, annots: AnnotInfo[]) => {
    setAnnotSelection((prev) => {
      if (!prev || prev.pageId !== pageId) return prev
      const info = annots.find((a) => a.id === prev.annotId)
      if (!info) return null
      return JSON.stringify(info) === JSON.stringify(prev.info) ? prev : { ...prev, info }
    })
  }, [])

  const createAnnot = useCallback(
    (pageId: number, spec: AnnotSpec) =>
      void run("Couldn't add the annotation", async () => {
        const { state, annot } = await pdf.createAnnot(pageId, spec, toolStyle)
        applyState(state)
        setAnnotSelection({ pageId, annotId: annot, info: null })
        if (spec.kind === 'note') {
          // Notes are one-off: go straight to typing the comment.
          setFocusComment(true)
          setTool('select')
        }
      }),
    [run, applyState, toolStyle],
  )

  const updateSelectedAnnot = useCallback(
    (patch: AnnotPatch) => {
      const sel = annotSelection
      if (!sel) return
      void run("Couldn't change the annotation", async () =>
        applyState(await pdf.updateAnnot(sel.pageId, sel.annotId, patch)),
      )
    },
    [annotSelection, run, applyState],
  )

  /**
   * Places an image in the middle of the current page, scaled to fit within
   * `maxWidth` points (default: half the page) at most at its natural size.
   */
  const placeImage = (blob: Blob, what: string, maxWidth?: number) => {
    const page = pages[currentPage]
    if (!page) return
    void run(`Couldn't add the ${what}`, async () => {
      const { payload, width, height } = await loadImage(blob)
      // Treat pixels as 1/96 inch, like a browser does, so images keep their usual size.
      const natural = Math.min(1, (maxWidth ?? page.width * 0.5) / (width * 0.75), (page.height * 0.5) / (height * 0.75))
      const w = width * 0.75 * natural
      const h = height * 0.75 * natural
      const x = (page.width - w) / 2
      const y = (page.height - h) / 2
      const rect: Rect = [x, y, x + w, y + h]
      const { state, annot } = await pdf.createAnnot(page.id, { kind: 'image', rect, image: payload }, { color: [0, 0, 0], opacity: 1, width: 0 })
      applyState(state)
      setTool('select')
      setAnnotSelection({ pageId: page.id, annotId: annot, info: null })
    })
  }

  const markRedactions = (query: string, matchCase: boolean) => {
    setDialog(null)
    void run("Couldn't mark the matches", async () => {
      const { state, count } = await pdf.markRedactions(query, matchCase)
      applyState(state)
      if (!count) setError(`No matches for “${query}”.`)
    })
  }

  const applyRedactions = () => {
    setDialog(null)
    void run("Couldn't apply redactions", async () => {
      applyState(await pdf.applyRedactions())
      setAnnotSelection(null)
      setTool('select')
    })
  }

  const addWatermark = (spec: WatermarkSpec, which: WatermarkPages) => {
    setDialog(null)
    const indices = which === 'all' ? pages.map((_, i) => i) : which === 'current' ? [currentPage] : selectedIndices
    void run("Couldn't add the watermark", async () => applyState(await pdf.watermark(indices, spec)))
  }

  const deleteSelectedAnnot = useCallback(() => {
    const sel = annotSelection
    if (!sel) return
    void run("Couldn't delete the annotation", async () => {
      applyState(await pdf.deleteAnnot(sel.pageId, sel.annotId))
      setAnnotSelection(null)
    })
  }, [annotSelection, run, applyState])

  const fillField = useCallback(
    (pageId: number, widgetId: number, change: FieldChange) => {
      formQueue.current = formQueue.current.then(async () => {
        try {
          applyState(await pdf.setField(pageId, widgetId, change))
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') setError(`Couldn't fill in the field: ${errorMessage(err)}`)
        }
      })
    },
    [applyState],
  )

  const changeToolStyle = (patch: Partial<AnnotStyle>) => {
    if (tool !== 'select') setToolStyles((styles) => ({ ...styles, [tool]: { ...styles[tool], ...patch } }))
  }

  const annotationController = useMemo<AnnotationController>(
    () => ({
      tool,
      style: toolStyle,
      busy,
      selection: annotSelection,
      select: selectAnnot,
      syncAnnotations,
      create: createAnnot,
      updateSelected: updateSelectedAnnot,
      fillField,
    }),
    [tool, toolStyle, busy, annotSelection, selectAnnot, syncAnnotations, createAnnot, updateSelectedAnnot, fillField],
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
      const key = event.key.toLowerCase()
      const target = event.target instanceof HTMLElement ? event.target : null
      const inField = target?.matches('input, textarea, select') ?? false
      if (!(event.ctrlKey || event.metaKey)) {
        // The sidebar handles Delete for pages itself.
        if (!doc || inField || target?.closest('.sidebar')) return
        if (key === 'escape') {
          if (annotSelection) setAnnotSelection(null)
          else setTool('select')
        } else if ((key === 'delete' || key === 'backspace') && annotSelection) {
          deleteSelectedAnnot()
        } else {
          return
        }
        event.preventDefault()
        return
      }
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
  }, [doc, download, history, zoomStep, setZoom, annotSelection, deleteSelectedAnnot])

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
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) placeImage(file, 'image')
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

      {doc && (
        <AnnotationBar
          tool={tool}
          toolStyle={toolStyle}
          selection={annotSelection}
          busy={busy}
          focusComment={focusComment}
          onToolChange={changeTool}
          onToolStyleChange={changeToolStyle}
          onUpdateSelected={(patch) => {
            updateSelectedAnnot(patch)
            // Restyling what you just drew also sets the style for the next one.
            const { color, width, opacity, font, fontSize } = patch
            const style = Object.fromEntries(Object.entries({ color, width, opacity, font, fontSize }).filter(([, v]) => v !== undefined))
            if (Object.keys(style).length) {
              changeToolStyle(style)
            }
          }}
          onDeleteSelected={deleteSelectedAnnot}
          onAddImage={() => imageInputRef.current?.click()}
          onAddSignature={() => setDialog('signature')}
          onAddWatermark={() => setDialog('watermark')}
          redactions={doc.redactions}
          onFindRedact={() => setDialog('findRedact')}
          onApplyRedactions={() => setDialog('applyRedact')}
        />
      )}

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button className="banner__close" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <AnnotationContext.Provider value={annotationController}>
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
      </AnnotationContext.Provider>

      {dialog === 'signature' && (
        <SignatureDialog
          onClose={() => setDialog(null)}
          onUse={(blob) => {
            setDialog(null)
            placeImage(blob, 'signature', 180)
          }}
        />
      )}
      {dialog === 'watermark' && (
        <WatermarkDialog selectedCount={pickedIds.size} onClose={() => setDialog(null)} onApply={addWatermark} />
      )}
      {dialog === 'findRedact' && <FindRedactDialog onClose={() => setDialog(null)} onMark={markRedactions} />}
      {dialog === 'applyRedact' && doc && (
        <ApplyRedactionsDialog count={doc.redactions} onClose={() => setDialog(null)} onApply={applyRedactions} />
      )}
      {dialog === 'downloadRedact' && doc && (
        <UnappliedRedactionsDialog
          count={doc.redactions}
          onClose={() => setDialog(null)}
          onApplyAndDownload={() => saveFile(true)}
          onDownloadAnyway={() => saveFile()}
        />
      )}

      {dragging && (
        <div className="drop-overlay">
          {doc ? 'Drop to open instead — or drop on the thumbnails to insert pages' : 'Drop to open'}
        </div>
      )}
    </div>
  )
}
