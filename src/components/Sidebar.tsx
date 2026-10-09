import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import type { PageInfo } from '../pdf/protocol'
import { Icon } from './Icon'
import { PageCanvas } from './PageCanvas'

const THUMBNAIL_WIDTH = 120
const PAGE_DRAG_TYPE = 'application/x-klone-pages'

interface Props {
  pages: PageInfo[]
  currentPage: number
  /** Ids of the pages actions apply to (the current page when nothing is picked). */
  selected: ReadonlySet<number>
  busy: boolean
  onSelectionChange(ids: Set<number>): void
  onNavigate(index: number): void
  onRotate(degrees: number): void
  onDelete(): void
  onExtract(): void
  onInsertBlank(): void
  onInsertFromFile(): void
  /** Move the selected pages before the page at index `to`. */
  onMove(to: number): void
  onDropFiles(files: File[], at: number): void
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function Sidebar(props: Props) {
  const { pages, currentPage, selected, busy } = props
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [insertMenuOpen, setInsertMenuOpen] = useState(false)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const anchor = useRef<number | null>(null)

  useEffect(() => {
    itemRefs.current[currentPage]?.scrollIntoView({ block: 'nearest' })
  }, [currentPage])

  useEffect(() => {
    if (!insertMenuOpen) return
    const close = () => setInsertMenuOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [insertMenuOpen])

  const selectRange = (from: number, to: number, base: Set<number>) => {
    const [lo, hi] = from < to ? [from, to] : [to, from]
    for (let i = lo; i <= hi; i++) base.add(pages[i].id)
    return base
  }

  const onThumbnailClick = (event: MouseEvent, index: number) => {
    const id = pages[index].id
    if (event.shiftKey) {
      const base = event.ctrlKey || event.metaKey ? new Set(selected) : new Set<number>()
      props.onSelectionChange(selectRange(anchor.current ?? currentPage, index, base))
    } else if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected)
      if (next.has(id) && next.size > 1) next.delete(id)
      else next.add(id)
      props.onSelectionChange(next)
      anchor.current = index
    } else {
      // A plain click just goes to the page; the highlight then follows it.
      props.onSelectionChange(new Set())
      props.onNavigate(index)
      anchor.current = index
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (busy) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      props.onDelete()
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      props.onSelectionChange(new Set(pages.map((p) => p.id)))
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = Math.min(Math.max(currentPage + (event.key === 'ArrowDown' ? 1 : -1), 0), pages.length - 1)
      props.onSelectionChange(new Set())
      props.onNavigate(next)
      itemRefs.current[next]?.focus()
    } else {
      return
    }
    event.preventDefault()
  }

  const dropIndexAt = (clientY: number) => {
    for (let i = 0; i < pages.length; i++) {
      const rect = itemRefs.current[i]?.getBoundingClientRect()
      if (rect && clientY < rect.top + rect.height / 2) return i
    }
    return pages.length
  }

  const accepts = (event: DragEvent) =>
    event.dataTransfer.types.includes(PAGE_DRAG_TYPE) || event.dataTransfer.types.includes('Files')

  const onDragStart = (event: DragEvent, index: number) => {
    if (!selected.has(pages[index].id)) props.onSelectionChange(new Set([pages[index].id]))
    event.dataTransfer.setData(PAGE_DRAG_TYPE, String(index))
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (event: DragEvent) => {
    if (busy || !accepts(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(PAGE_DRAG_TYPE) ? 'move' : 'copy'
    setDropIndex(dropIndexAt(event.clientY))
  }

  const onDrop = (event: DragEvent) => {
    if (busy || !accepts(event)) return
    event.preventDefault()
    const at = dropIndexAt(event.clientY)
    setDropIndex(null)
    if (event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) {
      props.onMove(at)
    } else {
      const files = [...event.dataTransfer.files].filter(isPdf)
      if (files.length) props.onDropFiles(files, at)
    }
  }

  const count = selected.size
  const label = count > 1 ? `${count} pages` : `Page ${currentPage + 1}`

  return (
    <aside className="sidebar">
      <div className="sidebar__actions" role="toolbar" aria-label={`Page actions (${label})`}>
        <span className="sidebar__selection">{label}</span>
        <button className="icon-button icon-button--sm" onClick={() => props.onRotate(-90)} disabled={busy} title="Rotate left">
          <Icon name="rotateCcw" />
        </button>
        <button className="icon-button icon-button--sm" onClick={() => props.onRotate(90)} disabled={busy} title="Rotate right">
          <Icon name="rotateCw" />
        </button>
        <button className="icon-button icon-button--sm" onClick={props.onDelete} disabled={busy || count >= pages.length} title="Delete (Del)">
          <Icon name="trash" />
        </button>
        <button className="icon-button icon-button--sm" onClick={props.onExtract} disabled={busy} title="Extract to a new PDF">
          <Icon name="extract" />
        </button>
        <div className="menu-anchor" onPointerDown={(e) => e.stopPropagation()}>
          <button
            className="icon-button icon-button--sm"
            onClick={() => setInsertMenuOpen((open) => !open)}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={insertMenuOpen}
            title="Insert pages"
          >
            <Icon name="filePlus" />
          </button>
          {insertMenuOpen && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={() => { setInsertMenuOpen(false); props.onInsertBlank() }}>
                Blank page
              </button>
              <button role="menuitem" onClick={() => { setInsertMenuOpen(false); props.onInsertFromFile() }}>
                Pages from PDF…
              </button>
            </div>
          )}
        </div>
      </div>

      <nav
        ref={setContainer}
        className="sidebar__pages"
        aria-label="Pages"
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null)
        }}
        onDrop={onDrop}
      >
        {pages.map((page, index) => {
          const classes = ['thumbnail']
          if (selected.has(page.id)) classes.push('thumbnail--selected')
          if (dropIndex === index) classes.push('thumbnail--drop-before')
          if (dropIndex === pages.length && index === pages.length - 1) classes.push('thumbnail--drop-after')
          return (
            <button
              key={page.id}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              className={classes.join(' ')}
              draggable={!busy}
              onDragStart={(e) => onDragStart(e, index)}
              onDragEnd={() => setDropIndex(null)}
              onClick={(e) => onThumbnailClick(e, index)}
              aria-label={`Page ${index + 1}`}
              aria-current={index === currentPage ? 'page' : undefined}
              aria-pressed={selected.has(page.id)}
            >
              <PageCanvas page={page} scale={THUMBNAIL_WIDTH / page.width} root={container} />
              <span className="thumbnail__label">{index + 1}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
