import { useEffect, useState, type ReactNode } from 'react'
import type { Mode } from '../annotations/modes'
import { SHAPE_TOOLS, type ShapeTool, type Tool } from '../annotations/tools'
import { ZOOM_PRESETS } from '../zoom'
import { Icon, type IconName } from './Icon'

export interface ToolRowActions {
  addImage(): void
  addSignature(): void
  addWatermark(): void
  runOcr(): void
  findRedact(): void
  applyRedactions(): void
  rotate(degrees: number): void
  deletePages(): void
  extractPages(): void
  insertBlank(): void
  insertPdf(): void
}

interface Props {
  mode: Mode
  tool: Tool
  busy: boolean
  redactions: number
  /** "Page 3" or "3 pages": what page actions apply to. */
  pageSelectionLabel: string
  canDeletePages: boolean
  sidebarOpen: boolean
  inspectorOpen: boolean
  canUndo: boolean
  canRedo: boolean
  currentPage: number
  pageCount: number
  scale: number
  fitWidth: boolean
  actions: ToolRowActions
  onToolChange(tool: Tool): void
  onToggleSidebar(): void
  onToggleInspector(): void
  onUndo(): void
  onRedo(): void
  onGoToPage(index: number): void
  onZoomIn(): void
  onZoomOut(): void
  onSetZoom(scale: number | 'fit'): void
}

const SHAPE_INFO: Record<ShapeTool, { icon: IconName; label: string }> = {
  rect: { icon: 'rect', label: 'Rectangle' },
  ellipse: { icon: 'ellipse', label: 'Ellipse' },
  line: { icon: 'line', label: 'Line' },
  arrow: { icon: 'arrow', label: 'Arrow' },
}

function ToolButton({ icon, label, pressed, onClick, disabled, title }: { icon: IconName; label: string; pressed?: boolean; onClick(): void; disabled?: boolean; title?: string }) {
  return (
    <button className="kw-tool" aria-pressed={pressed} onClick={onClick} disabled={disabled} title={title ?? label}>
      <Icon name={icon} size={18} />
      <span className="kw-tool__label">{label}</span>
    </button>
  )
}

export function ToolRow(props: Props) {
  const { mode, tool, busy, actions } = props
  const tools = (list: { tool: Tool; icon: IconName; label: string }[]) =>
    list.map((t) => <ToolButton key={t.tool} icon={t.icon} label={t.label} pressed={tool === t.tool} onClick={() => props.onToolChange(t.tool)} />)
  const select = tools([{ tool: 'select', icon: 'select', label: 'Select' }])

  let content: ReactNode
  switch (mode) {
    case 'view':
      content = select
      break
    case 'annotate':
      content = (
        <>
          {select}
          {tools([
            { tool: 'highlight', icon: 'highlight', label: 'Highlight' },
            { tool: 'underline', icon: 'underline', label: 'Underline' },
            { tool: 'strikeout', icon: 'strikeout', label: 'Strike out' },
            { tool: 'note', icon: 'comment', label: 'Comment' },
            { tool: 'text', icon: 'textBox', label: 'Text box' },
          ])}
          <ShapesButton tool={tool} onToolChange={props.onToolChange} />
          {tools([{ tool: 'ink', icon: 'draw', label: 'Draw' }])}
        </>
      )
      break
    case 'edit':
      content = (
        <>
          {select}
          {tools([
            { tool: 'editText', icon: 'editText', label: 'Edit text' },
            { tool: 'text', icon: 'textBox', label: 'Text box' },
          ])}
          <span className="kw-divider" />
          <ToolButton icon="image" label="Image" onClick={actions.addImage} disabled={busy} title="Add an image" />
          <ToolButton icon="watermark" label="Watermark" onClick={actions.addWatermark} disabled={busy} title="Add a watermark" />
          <ToolButton icon="ocr" label="Run OCR" onClick={actions.runOcr} disabled={busy} title="Recognise text in scanned pages" />
        </>
      )
      break
    case 'organize':
      content = (
        <>
          {select}
          <span className="kw-divider" />
          <span className="kw-mono toolrow__scope">{props.pageSelectionLabel}</span>
          <ToolButton icon="revert" label="Rotate left" onClick={() => actions.rotate(-90)} disabled={busy} />
          <ToolButton icon="rotate" label="Rotate right" onClick={() => actions.rotate(90)} disabled={busy} />
          <ToolButton icon="trash" label="Delete" onClick={actions.deletePages} disabled={busy || !props.canDeletePages} title="Delete pages (Del)" />
          <ToolButton icon="extract" label="Extract" onClick={actions.extractPages} disabled={busy} title="Save these pages as a new PDF" />
          <span className="kw-divider" />
          <ToolButton icon="filePlus" label="Blank page" onClick={actions.insertBlank} disabled={busy} title="Insert a blank page after these" />
          <ToolButton icon="merge" label="Insert PDF" onClick={actions.insertPdf} disabled={busy} title="Insert or merge pages from other PDFs" />
        </>
      )
      break
    case 'sign':
      content = (
        <>
          {select}
          <ToolButton icon="sign" label="Add signature" onClick={actions.addSignature} disabled={busy} />
          <ToolButton icon="image" label="Image" onClick={actions.addImage} disabled={busy} title="Add an image, such as a stamp" />
        </>
      )
      break
    case 'protect':
      content = (
        <>
          {select}
          {tools([
            { tool: 'redactText', icon: 'redact', label: 'Redact text' },
            { tool: 'redactArea', icon: 'redactArea', label: 'Redact area' },
          ])}
          <ToolButton icon="search" label="Find & redact" onClick={actions.findRedact} disabled={busy} />
          <span className="kw-divider" />
          <button
            className={`kw-btn kw-btn--sm ${props.redactions ? 'kw-btn--danger' : 'kw-btn--secondary'}`}
            onClick={actions.applyRedactions}
            disabled={busy || !props.redactions}
            title="Permanently remove everything under the redaction marks"
          >
            Apply redactions
            {props.redactions > 0 && <span className="kw-mono">({props.redactions})</span>}
          </button>
        </>
      )
      break
  }

  return (
    <div className="kw-toolrow toolrow" role="toolbar" aria-label="Tools">
      <button className="kw-tool kw-tool--icon kw-tool--toggle" aria-pressed={props.sidebarOpen} onClick={props.onToggleSidebar} title="Page thumbnails" aria-label="Page thumbnails">
        <Icon name="sidebar" size={18} />
      </button>
      <span className="kw-divider" />
      <div className="toolrow__tools">{content}</div>

      <div className="toolrow__end">
        <button className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" onClick={props.onUndo} disabled={busy || !props.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" onClick={props.onRedo} disabled={busy || !props.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
          <Icon name="redo" />
        </button>
        <span className="kw-divider" />
        <PageInput key={props.currentPage} currentPage={props.currentPage} pageCount={props.pageCount} onGoToPage={props.onGoToPage} />
        <span className="kw-divider" />
        <button className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" onClick={props.onZoomOut} aria-label="Zoom out" title="Zoom out (Ctrl+−)">
          <Icon name="zoomOut" />
        </button>
        <select
          className="kw-select kw-input--mono toolrow__zoom"
          aria-label="Zoom"
          value={props.fitWidth ? 'fit' : String(props.scale)}
          onChange={(e) => props.onSetZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
        >
          <option value="fit">Fit {Math.round(props.scale * 100)}%</option>
          {!props.fitWidth && !ZOOM_PRESETS.includes(props.scale) && <option value={String(props.scale)}>{Math.round(props.scale * 100)}%</option>}
          {ZOOM_PRESETS.map((z) => (
            <option key={z} value={String(z)}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        <button className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" onClick={props.onZoomIn} aria-label="Zoom in" title="Zoom in (Ctrl+=)">
          <Icon name="zoomIn" />
        </button>
        <button
          className="kw-tool kw-tool--icon kw-tool--toggle"
          aria-pressed={props.fitWidth}
          onClick={() => props.onSetZoom('fit')}
          aria-label="Fit width"
          title="Fit width (Ctrl+0)"
        >
          <Icon name="fitWidth" size={18} />
        </button>
        <span className="kw-divider" />
        <button className="kw-tool kw-tool--icon kw-tool--toggle" aria-pressed={props.inspectorOpen} onClick={props.onToggleInspector} title="Inspector" aria-label="Inspector">
          <Icon name="inspector" size={18} />
        </button>
      </div>
    </div>
  )
}

function ShapesButton({ tool, onToolChange }: { tool: Tool; onToolChange(tool: Tool): void }) {
  const active = (SHAPE_TOOLS as readonly Tool[]).includes(tool)
  const [last, setLast] = useState<ShapeTool>('rect')
  const [open, setOpen] = useState(false)
  const shape = active ? (tool as ShapeTool) : last
  const info = SHAPE_INFO[shape]

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (s: ShapeTool) => {
    setLast(s)
    setOpen(false)
    onToolChange(s)
  }

  return (
    <div className="split-tool" onPointerDown={(e) => e.stopPropagation()}>
      <button className="kw-tool" aria-pressed={active} onClick={() => pick(shape)} title={info.label}>
        <Icon name={info.icon} size={18} />
        <span className="kw-tool__label">{active ? info.label : 'Shapes'}</span>
      </button>
      <button
        className="kw-tool kw-tool--icon split-tool__more"
        aria-label="Choose a shape"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="kw-popover menu" role="menu">
          {SHAPE_TOOLS.map((s) => (
            <button key={s} className="kw-menu__item" role="menuitem" onClick={() => pick(s)}>
              <Icon name={SHAPE_INFO[s].icon} />
              {SHAPE_INFO[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
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
      <button className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" onClick={() => onGoToPage(currentPage - 1)} disabled={currentPage <= 0} aria-label="Previous page">
        <Icon name="chevronUp" />
      </button>
      <input
        className="kw-input kw-input--mono"
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
      <span className="kw-mono page-input__total">/ {pageCount}</span>
      <button className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" onClick={() => onGoToPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next page">
        <Icon name="chevronDown" />
      </button>
    </span>
  )
}
