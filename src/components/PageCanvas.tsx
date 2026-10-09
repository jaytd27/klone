import { useEffect, useRef, useState } from 'react'
import { pdf } from '../pdf/client'
import type { PageSize } from '../pdf/protocol'

// Keep any single canvas under ~16 megapixels; browsers refuse larger ones.
const MAX_CANVAS_PIXELS = 16_000_000
// Wait for zooming to settle before re-rendering an already-drawn page.
const RERENDER_DELAY_MS = 150

interface Props {
  index: number
  size: PageSize
  /** CSS pixels per PDF point. */
  scale: number
  /** Scroll container used to decide which pages are near the viewport. */
  root: Element | null
  className?: string
}

export function PageCanvas({ index, size, scale, root, className }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderedScale = useRef<number | null>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [drawn, setDrawn] = useState(false)

  const cssWidth = Math.round(size.width * scale)
  const cssHeight = Math.round(size.height * scale)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNearViewport(entry.isIntersecting)
        const canvas = canvasRef.current
        if (!entry.isIntersecting && canvas && renderedScale.current !== null) {
          // Release the bitmap of pages far off screen.
          canvas.width = 0
          canvas.height = 0
          renderedScale.current = null
          setDrawn(false)
        }
      },
      { root, rootMargin: '100% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !nearViewport) return

    const dpr = window.devicePixelRatio || 1
    const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / (size.width * size.height))
    const target = Math.min(scale * dpr, maxScale)
    if (renderedScale.current === target) return

    const controller = new AbortController()
    const delay = renderedScale.current === null ? 0 : RERENDER_DELAY_MS
    const timer = setTimeout(() => {
      pdf.render(index, target, controller.signal).then(
        ({ width, height, pixels }) => {
          canvas.width = width
          canvas.height = height
          canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
          renderedScale.current = target
          setDrawn(true)
        },
        (err) => {
          if (err?.name !== 'AbortError') console.error(`Failed to render page ${index + 1}`, err)
        },
      )
    }, delay)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [nearViewport, index, scale, size.width, size.height])

  return (
    <div
      ref={wrapperRef}
      className={`page ${drawn ? '' : 'page--loading'} ${className ?? ''}`}
      style={{ width: cssWidth, height: cssHeight }}
    >
      <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight }} />
    </div>
  )
}
