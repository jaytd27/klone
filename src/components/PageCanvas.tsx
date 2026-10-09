import { useEffect, useRef, useState } from 'react'
import { pdf } from '../pdf/client'
import type { PageInfo } from '../pdf/protocol'

// Keep any single canvas under ~16 megapixels; browsers refuse larger ones.
const MAX_CANVAS_PIXELS = 16_000_000
// Wait for zooming to settle before re-rendering an already-drawn page.
const RERENDER_DELAY_MS = 150

interface Props {
  page: PageInfo
  /** CSS pixels per PDF point. */
  scale: number
  /** Scroll container used to decide which pages are near the viewport. */
  root: Element | null
}

export function PageCanvas({ page, scale, root }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** What the canvas currently shows, or null when it is empty. */
  const rendered = useRef<{ scale: number; rotation: number } | null>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [drawn, setDrawn] = useState(false)

  const { id, width, height, rotation } = page
  const cssWidth = Math.round(width * scale)
  const cssHeight = Math.round(height * scale)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNearViewport(entry.isIntersecting)
        const canvas = canvasRef.current
        if (!entry.isIntersecting && canvas && rendered.current !== null) {
          // Release the bitmap of pages far off screen.
          canvas.width = 0
          canvas.height = 0
          rendered.current = null
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
    const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
    const target = Math.min(scale * dpr, maxScale)
    const current = rendered.current
    if (current?.scale === target && current.rotation === rotation) return

    const controller = new AbortController()
    // Only zoom changes are debounced; new or rotated content renders at once.
    const delay = current && current.rotation === rotation ? RERENDER_DELAY_MS : 0
    const timer = setTimeout(() => {
      pdf.render(id, target, controller.signal).then(
        ({ width, height, pixels }) => {
          canvas.width = width
          canvas.height = height
          canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
          rendered.current = { scale: target, rotation }
          setDrawn(true)
        },
        (err) => {
          if (err?.name !== 'AbortError') console.error(`Failed to render page ${id}`, err)
        },
      )
    }, delay)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [nearViewport, id, scale, width, height, rotation])

  return (
    <div ref={wrapperRef} className={`page ${drawn ? '' : 'page--loading'}`} style={{ width: cssWidth, height: cssHeight }}>
      <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight }} />
    </div>
  )
}
