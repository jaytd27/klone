import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { PageSize } from '../pdf/protocol'
import { PageCanvas } from './PageCanvas'

// Must match the padding and gap of .viewer__pages in App.css.
export const VIEWER_PADDING = 24
export const PAGE_GAP = 16

export interface ViewerHandle {
  scrollToPage(index: number): void
}

interface Props {
  ref?: Ref<ViewerHandle>
  pages: PageSize[]
  scale: number
  onCurrentPageChange(index: number): void
  onWidthChange(width: number): void
  /** Ctrl+wheel / pinch zoom; factor > 1 zooms in. */
  onZoom(factor: number): void
}

function pageTops(pages: PageSize[], scale: number): number[] {
  const tops: number[] = []
  let y = VIEWER_PADDING
  for (const page of pages) {
    tops.push(y)
    y += Math.round(page.height * scale) + PAGE_GAP
  }
  return tops
}

/** Index of the last page whose top is at or above `y`. */
function pageAt(tops: number[], y: number): number {
  let lo = 0
  let hi = tops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tops[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function Viewer({ ref, pages, scale, onCurrentPageChange, onWidthChange, onZoom }: Props) {
  // State so observers re-attach when the element mounts; the ref is for
  // imperatively adjusting scroll position.
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const tops = useMemo(() => pageTops(pages, scale), [pages, scale])
  const previous = useRef({ scale, tops })
  const currentPage = useRef(0)

  useImperativeHandle(ref, () => ({
    scrollToPage(index) {
      if (scrollRef.current) scrollRef.current.scrollTop = tops[index] - VIEWER_PADDING / 2
    },
  }), [tops])

  // Keep the same spot of the same page under the viewport when zoom changes.
  useLayoutEffect(() => {
    const prev = previous.current
    previous.current = { scale, tops }
    const el = scrollRef.current
    if (!el || prev.scale === scale) return
    const index = pageAt(prev.tops, el.scrollTop)
    const offsetInPage = (el.scrollTop - prev.tops[index]) * (scale / prev.scale)
    el.scrollTop = tops[index] + offsetInPage
    const centerX = el.scrollLeft + el.clientWidth / 2
    el.scrollLeft = centerX * (scale / prev.scale) - el.clientWidth / 2
  }, [scale, tops])

  const handleScroll = useCallback(() => {
    if (!container) return
    const index = pageAt(tops, container.scrollTop + container.clientHeight / 3)
    if (index !== currentPage.current) {
      currentPage.current = index
      onCurrentPageChange(index)
    }
  }, [container, tops, onCurrentPageChange])

  useEffect(() => {
    if (!container) return
    const observer = new ResizeObserver(([entry]) => onWidthChange(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [container, onWidthChange])

  useEffect(() => {
    if (!container) return
    // React's onWheel is passive, so preventDefault needs a native listener.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onZoom(Math.exp(-event.deltaY * 0.002))
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [container, onZoom])

  return (
    <div
      ref={(el) => {
        scrollRef.current = el
        setContainer(el)
      }}
      className="viewer"
      onScroll={handleScroll}
    >
      <div className="viewer__pages">
        {pages.map((size, index) => (
          <PageCanvas key={index} index={index} size={size} scale={scale} root={container} />
        ))}
      </div>
    </div>
  )
}
