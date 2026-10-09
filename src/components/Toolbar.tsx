import { useState } from 'react'
import { Icon } from './Icon'
import { ZOOM_PRESETS } from '../zoom'

interface Props {
  fileName: string | null
  pageCount: number
  currentPage: number
  scale: number
  fitWidth: boolean
  sidebarOpen: boolean
  busy: boolean
  canUndo: boolean
  canRedo: boolean
  onOpen(): void
  onUndo(): void
  onRedo(): void
  onDownload(): void
  onOcr(): void
  onToggleSidebar(): void
  onGoToPage(index: number): void
  onZoomIn(): void
  onZoomOut(): void
  onSetZoom(scale: number | 'fit'): void
}

export function Toolbar(props: Props) {
  const { fileName, pageCount, currentPage, scale, fitWidth } = props
  const hasDoc = pageCount > 0
  const percent = Math.round(scale * 100)
  const zoomValue = fitWidth ? 'fit' : String(scale)
  const isPreset = ZOOM_PRESETS.includes(scale)

  return (
    <header className="toolbar">
      <div className="toolbar__group">
        <span className="brand">Klone</span>
        <button className="icon-button" onClick={props.onToggleSidebar} disabled={!hasDoc} aria-pressed={props.sidebarOpen} title="Toggle page thumbnails">
          <Icon name="sidebar" />
        </button>
        <button className="button" onClick={props.onOpen} disabled={props.busy} title="Open (Ctrl+O)">
          <Icon name="open" /><span className="button__label">Open</span>
        </button>
        {hasDoc && (
          <>
            <button className="icon-button" onClick={props.onUndo} disabled={props.busy || !props.canUndo} title="Undo (Ctrl+Z)">
              <Icon name="undo" />
            </button>
            <button className="icon-button" onClick={props.onRedo} disabled={props.busy || !props.canRedo} title="Redo (Ctrl+Y)">
              <Icon name="redo" />
            </button>
          </>
        )}
        {fileName && <span className="file-name" title={fileName}>{fileName}</span>}
      </div>

      {hasDoc && (
        <div className="toolbar__group">
          <button className="icon-button" onClick={() => props.onGoToPage(currentPage - 1)} disabled={currentPage <= 0} title="Previous page">
            <Icon name="chevronUp" />
          </button>
          <PageInput key={currentPage} currentPage={currentPage} pageCount={pageCount} onGoToPage={props.onGoToPage} />
          <button className="icon-button" onClick={() => props.onGoToPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} title="Next page">
            <Icon name="chevronDown" />
          </button>

          <span className="toolbar__divider" />

          <button className="icon-button" onClick={props.onZoomOut} title="Zoom out (Ctrl+−)">
            <Icon name="minus" />
          </button>
          <select className="zoom-select hide-narrow" value={zoomValue} onChange={(e) => props.onSetZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))} aria-label="Zoom">
            <option value="fit">Fit width ({percent}%)</option>
            {!fitWidth && !isPreset && <option value={String(scale)}>{percent}%</option>}
            {ZOOM_PRESETS.map((z) => (
              <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>
            ))}
          </select>
          <button className="icon-button" onClick={props.onZoomIn} title="Zoom in (Ctrl+=)">
            <Icon name="plus" />
          </button>
          <button className="icon-button hide-narrow" onClick={() => props.onSetZoom('fit')} aria-pressed={fitWidth} title="Fit width (Ctrl+0)">
            <Icon name="fitWidth" />
          </button>
        </div>
      )}

      <div className="toolbar__group toolbar__group--end">
        {hasDoc && (
          <button className="button" onClick={props.onOcr} disabled={props.busy} title="Recognize text in scanned pages (OCR)">
            <Icon name="scan" />
            <span className="button__label">OCR</span>
          </button>
        )}
        {hasDoc && (
          <button className="button button--primary" onClick={props.onDownload} disabled={props.busy} title="Download (Ctrl+S)">
            <Icon name="download" /><span className="button__label">Download</span>
          </button>
        )}
      </div>
    </header>
  )
}

function PageInput({ currentPage, pageCount, onGoToPage }: { currentPage: number; pageCount: number; onGoToPage(index: number): void }) {
  const [draft, setDraft] = useState(String(currentPage + 1))

  const commit = () => {
    const n = Number.parseInt(draft, 10)
    if (Number.isFinite(n)) onGoToPage(Math.min(Math.max(n, 1), pageCount) - 1)
    else setDraft(String(currentPage + 1))
  }

  return (
    <span className="page-input">
      <input
        value={draft}
        inputMode="numeric"
        aria-label="Page number"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        onFocus={(e) => e.currentTarget.select()}
      />
      <span className="page-input__total">/ {pageCount}</span>
    </span>
  )
}
