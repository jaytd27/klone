import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import type { PageInfo } from '../pdf/protocol'
import { PageCanvas } from './PageCanvas'

const THUMBNAIL_WIDTH = 124
const PAGE_DRAG_TYPE = 'application/x-kwoon-pages'

interface Props {
  pages: PageInfo[]
  currentPage: number
  /** Ids of the pages actions apply to (the current page when nothing is picked). */
  selected: ReadonlySet<number>
  busy: boolean
  onSelectionChange(ids: Set<number>): void
  onNavigate(index: number): void
  onDelete(): void
  /** Move the selected pages before the page at index `to`. */
  onMove(to: number): void
  onDropFiles(files: File[], at: number): void
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/** Page thumbnails: click to go, Ctrl/Shift-click to select, drag to reorder, drop PDFs to insert. */
export function Sidebar(props: Props) {
  const { pages, currentPage, selected, busy } = props
  // State so thumbnails can observe the list; the ref is for scrolling it.
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const listRef = useRef<HTMLElement | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const anchor = useRef<number | null>(null)

  // Keep the current page's thumbnail in view. Only this list scrolls:
  // scrollIntoView would also scroll the app shell on narrow layouts.
  useEffect(() => {
    const item = itemRefs.current[currentPage]
    const list = listRef.current
    if (!item || !list) return
    const i = item.getBoundingClientRect()
    const c = list.getBoundingClientRect()
    const margin = 8
    if (i.top < c.top) list.scrollTop -= c.top - i.top + margin
    else if (i.bottom > c.bottom) list.scrollTop += i.bottom - c.bottom + margin
    if (i.left < c.left) list.scrollLeft -= c.left - i.left + margin
    else if (i.right > c.right) list.scrollLeft += i.right - c.right + margin
  }, [currentPage, container])

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

  return (
    <nav
      ref={(el) => {
        listRef.current = el
        setContainer(el)
      }}
      className="kw-sidebar kw-sidebar--thumbs thumbs"
      aria-label="Pages"
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null)
      }}
      onDrop={onDrop}
    >
      {pages.map((page, index) => {
        const classes = ['kw-thumb', 'thumb']
        if (index === currentPage) classes.push('is-current')
        if (selected.has(page.id)) classes.push('is-selected')
        if (dropIndex === index) classes.push('thumb--drop-before')
        if (dropIndex === pages.length && index === pages.length - 1) classes.push('thumb--drop-after')
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
            aria-label={`Page ${index + 1}${page.edited ? ', edited' : ''}`}
            aria-current={index === currentPage ? 'page' : undefined}
            aria-pressed={selected.has(page.id)}
          >
            <span className="kw-thumb__page thumb__page">
              <PageCanvas page={page} scale={THUMBNAIL_WIDTH / page.width} root={container} />
              {page.edited && <span className="thumb__dot" aria-hidden="true" />}
            </span>
            <span className="kw-thumb__num">{index + 1}</span>
          </button>
        )
      })}
    </nav>
  )
}
