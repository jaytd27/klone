import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useAnnotations } from '../annotations/context'
import { MARKUP_TOOLS, rgbToHex, type Tool } from '../annotations/tools'
import { pdf } from '../pdf/client'
import type { AnnotInfo, PageInfo, Point, Quad, Rect } from '../pdf/protocol'

type Draft =
  | { kind: 'shape'; tool: 'rect' | 'ellipse' | 'line' | 'arrow'; from: Point; to: Point }
  | { kind: 'ink'; points: Point[] }
  | { kind: 'markup'; from: Point; quads: Quad[] }
  | { kind: 'move'; from: Point; to: Point }

interface Props {
  page: PageInfo
  /** CSS pixels per PDF point. */
  scale: number
}

const SHAPE_TOOLS: ReadonlySet<Tool> = new Set(['rect', 'ellipse', 'line', 'arrow'])

const CURSORS: Record<Tool, string> = {
  select: 'default',
  highlight: 'text',
  underline: 'text',
  strikeout: 'text',
  note: 'copy',
  rect: 'crosshair',
  ellipse: 'crosshair',
  line: 'crosshair',
  arrow: 'crosshair',
  ink: 'crosshair',
}

function contains([x0, y0, x1, y1]: Rect, [x, y]: Point, slop: number) {
  return x >= x0 - slop && x <= x1 + slop && y >= y0 - slop && y <= y1 + slop
}

function quadPoints(q: Quad) {
  // Quads are UL, UR, LL, LR; draw them as a closed polygon.
  return `${q[0]},${q[1]} ${q[2]},${q[3]} ${q[6]},${q[7]} ${q[4]},${q[5]}`
}

/** Annotation overlay for one page: drawing previews, hit-testing and selection. */
export function AnnotationLayer({ page, scale }: Props) {
  const ctx = useAnnotations()
  const [annots, setAnnots] = useState<AnnotInfo[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [hovering, setHovering] = useState(false)
  const sync = useRef(ctx.syncAnnotations)
  /** Latest pointer position for text selection, and whether a lookup is in flight. */
  const markup = useRef<{ to: Point; pending: boolean }>({ to: [0, 0], pending: false })

  useEffect(() => {
    sync.current = ctx.syncAnnotations
  }, [ctx.syncAnnotations])

  useEffect(() => {
    let live = true
    pdf.listAnnots(page.id).then(
      (list) => {
        if (!live) return
        setAnnots(list)
        sync.current(page.id, list)
      },
      (err) => {
        if (err?.name !== 'AbortError') console.error('Failed to load annotations', err)
      },
    )
    return () => {
      live = false
    }
  }, [page.id, page.rev])

  const { tool, style, selection } = ctx
  const color = rgbToHex(style.color)

  const toPage = (event: PointerEvent): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale]
  }

  const hitTest = (p: Point) => [...annots].reverse().find((a) => contains(a.bounds, p, 4 / scale)) ?? null

  const updateMarkup = (from: Point) => {
    const state = markup.current
    if (state.pending) return
    state.pending = true
    const to = state.to
    pdf.textQuads(page.id, from, to).then(
      (quads) => {
        state.pending = false
        setDraft((d) => (d?.kind === 'markup' ? { ...d, quads } : d))
        if (state.to !== to) updateMarkup(from)
      },
      () => {
        state.pending = false
      },
    )
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const p = toPage(event)
    if (tool === 'select') {
      const hit = hitTest(p)
      ctx.select(page.id, hit)
      if (hit) {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDraft({ kind: 'move', from: p, to: p })
      }
      return
    }
    if (ctx.busy) return
    event.preventDefault()
    if (tool === 'note') {
      ctx.create(page.id, { kind: 'note', at: p })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (MARKUP_TOOLS.has(tool)) {
      markup.current.to = p
      setDraft({ kind: 'markup', from: p, quads: [] })
    } else if (tool === 'ink') {
      setDraft({ kind: 'ink', points: [p] })
    } else if (SHAPE_TOOLS.has(tool)) {
      setDraft({ kind: 'shape', tool: tool as 'rect', from: p, to: p })
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const p = toPage(event)
    if (!draft) {
      if (tool === 'select') setHovering(hitTest(p) !== null)
      return
    }
    switch (draft.kind) {
      case 'move':
      case 'shape':
        setDraft({ ...draft, to: p })
        break
      case 'ink': {
        const [lx, ly] = draft.points[draft.points.length - 1]
        if (Math.hypot(p[0] - lx, p[1] - ly) * scale >= 1.5) setDraft({ ...draft, points: [...draft.points, p] })
        break
      }
      case 'markup':
        markup.current.to = p
        updateMarkup(draft.from)
        break
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!draft) return
    const p = toPage(event)
    setDraft(null)
    switch (draft.kind) {
      case 'move': {
        const offset: Point = [p[0] - draft.from[0], p[1] - draft.from[1]]
        if (Math.hypot(...offset) * scale > 2) ctx.moveSelected(offset)
        break
      }
      case 'shape': {
        const [x0, y0] = draft.from
        const [x1, y1] = p
        if (draft.tool === 'rect' || draft.tool === 'ellipse') {
          if (Math.abs(x1 - x0) >= 2 && Math.abs(y1 - y0) >= 2) {
            ctx.create(page.id, { kind: draft.tool, rect: [x0, y0, x1, y1] })
          }
        } else if (Math.hypot(x1 - x0, y1 - y0) >= 3) {
          ctx.create(page.id, { kind: draft.tool, from: draft.from, to: p })
        }
        break
      }
      case 'ink':
        if (draft.points.length >= 2) ctx.create(page.id, { kind: 'ink', strokes: [draft.points] })
        break
      case 'markup': {
        const kind = tool as 'highlight' | 'underline' | 'strikeout'
        pdf.textQuads(page.id, draft.from, p).then((quads) => {
          if (quads.length) ctx.create(page.id, { kind, quads })
        })
        break
      }
    }
  }

  const selected = selection?.pageId === page.id ? selection.info : null
  const moveOffset = draft?.kind === 'move' ? [draft.to[0] - draft.from[0], draft.to[1] - draft.from[1]] : [0, 0]

  return (
    <svg
      className={`annot-layer ${tool === 'select' ? '' : 'annot-layer--drawing'}`}
      style={{ cursor: tool === 'select' && (hovering || draft) ? 'move' : CURSORS[tool] }}
      viewBox={`0 0 ${page.width} ${page.height}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDraft(null)}
      onPointerLeave={() => setHovering(false)}
    >
      {selected && (
        <rect
          className="annot-selection"
          x={selected.bounds[0] - 2 + moveOffset[0]}
          y={selected.bounds[1] - 2 + moveOffset[1]}
          width={selected.bounds[2] - selected.bounds[0] + 4}
          height={selected.bounds[3] - selected.bounds[1] + 4}
        />
      )}
      {draft?.kind === 'markup' &&
        draft.quads.map((q, i) => <polygon key={i} points={quadPoints(q)} fill={color} opacity={0.35} />)}
      {draft?.kind === 'ink' && (
        <polyline
          points={draft.points.map((pt) => pt.join(',')).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={style.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={style.opacity}
        />
      )}
      {draft?.kind === 'shape' && <ShapePreview draft={draft} color={color} width={style.width} opacity={style.opacity} />}
    </svg>
  )
}

function ShapePreview({ draft, color, width, opacity }: { draft: Extract<Draft, { kind: 'shape' }>; color: string; width: number; opacity: number }) {
  const [x0, y0] = draft.from
  const [x1, y1] = draft.to
  const common = { fill: 'none', stroke: color, strokeWidth: width, opacity }
  if (draft.tool === 'rect') {
    return <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} {...common} />
  }
  if (draft.tool === 'ellipse') {
    return <ellipse cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} rx={Math.abs(x1 - x0) / 2} ry={Math.abs(y1 - y0) / 2} {...common} />
  }
  return <line x1={x0} y1={y0} x2={x1} y2={y1} strokeLinecap="round" {...common} />
}
