import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { useAnnotations } from '../annotations/context'
import { FONTS, MARKUP_TOOLS, REDACT_COLOR, RESIZABLE_TYPES, rgbToHex, type Tool } from '../annotations/tools'
import { pdf } from '../pdf/client'
import type { AnnotInfo, PageInfo, Point, Quad, Rect, TextFont } from '../pdf/protocol'

type Draft =
  | { kind: 'shape'; tool: 'rect' | 'ellipse' | 'line' | 'arrow' | 'redactArea'; from: Point; to: Point }
  | { kind: 'ink'; points: Point[] }
  | { kind: 'markup'; from: Point; quads: Quad[] }
  | { kind: 'move'; from: Point; to: Point }
  /** `fixed` is the corner opposite the one being dragged. */
  | { kind: 'resize'; fixed: Point; rect: Rect; aspect: number | null }

/** An open text box editor: a new box at `at`, or an existing one being edited. */
interface TextEditor {
  at: Point
  annot: AnnotInfo | null
}

interface Props {
  page: PageInfo
  /** CSS pixels per PDF point. */
  scale: number
}

const SHAPE_TOOLS: ReadonlySet<Tool> = new Set(['rect', 'ellipse', 'line', 'arrow', 'redactArea'])
/** Tools that select text by dragging across it. */
const TEXT_TOOLS: ReadonlySet<Tool> = new Set([...MARKUP_TOOLS, 'redactText'])
/** Must match TEXT_PADDING in the worker so edited text lines up with the rendering. */
const TEXT_PADDING = 4
const HANDLE_SIZE = 8

const CURSORS: Record<Tool, string> = {
  select: 'default',
  highlight: 'text',
  underline: 'text',
  strikeout: 'text',
  note: 'copy',
  text: 'text',
  rect: 'crosshair',
  ellipse: 'crosshair',
  line: 'crosshair',
  arrow: 'crosshair',
  ink: 'crosshair',
  redactText: 'text',
  redactArea: 'crosshair',
  editText: 'default',
}

function contains([x0, y0, x1, y1]: Rect, [x, y]: Point, slop: number) {
  return x >= x0 - slop && x <= x1 + slop && y >= y0 - slop && y <= y1 + slop
}

function quadPoints(q: Quad) {
  // Quads are UL, UR, LL, LR; draw them as a closed polygon.
  return `${q[0]},${q[1]} ${q[2]},${q[3]} ${q[6]},${q[7]} ${q[4]},${q[5]}`
}

function corners([x0, y0, x1, y1]: Rect): Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
}

/** Annotation overlay for one page: drawing previews, hit-testing, selection and text editing. */
export function AnnotationLayer({ page, scale }: Props) {
  const ctx = useAnnotations()
  const svgRef = useRef<SVGSVGElement>(null)
  const [annots, setAnnots] = useState<AnnotInfo[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editor, setEditor] = useState<TextEditor | null>(null)
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
  const color = tool === 'redactText' || tool === 'redactArea' ? REDACT_COLOR : rgbToHex(style.color)

  const toPage = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale]
  }

  const hitTest = (p: Point) => [...annots].reverse().find((a) => contains(a.bounds, p, 4 / scale)) ?? null

  const openTextEditor = (annot: AnnotInfo) => {
    const [x, y] = annot.rect ?? annot.bounds
    ctx.select(page.id, annot)
    setEditor({ at: [x, y], annot })
  }

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
    if (event.button !== 0 || editor) return
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
    if (tool === 'text') {
      const hit = hitTest(p)
      if (hit?.type === 'FreeText') openTextEditor(hit)
      else setEditor({ at: [p[0] - TEXT_PADDING, p[1] - (style.fontSize ?? 14) * 0.6 - TEXT_PADDING], annot: null })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (TEXT_TOOLS.has(tool)) {
      markup.current.to = p
      setDraft({ kind: 'markup', from: p, quads: [] })
    } else if (tool === 'ink') {
      setDraft({ kind: 'ink', points: [p] })
    } else if (SHAPE_TOOLS.has(tool)) {
      setDraft({ kind: 'shape', tool: tool as 'rect', from: p, to: p })
    }
  }

  const onHandleDown = (event: PointerEvent, corner: number, rect: Rect, keepAspect: boolean) => {
    if (event.button !== 0) return
    event.stopPropagation()
    svgRef.current!.setPointerCapture(event.pointerId)
    const fixed = corners(rect)[(corner + 2) % 4]
    const aspect = keepAspect ? (rect[2] - rect[0]) / (rect[3] - rect[1]) : null
    setDraft({ kind: 'resize', fixed, rect, aspect })
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
      case 'resize': {
        const [fx, fy] = draft.fixed
        const min = 4
        let w = Math.max(Math.abs(p[0] - fx), min)
        let h = Math.max(Math.abs(p[1] - fy), min)
        if (draft.aspect) {
          // Keep the aspect ratio, following whichever side moved further.
          if (w / h > draft.aspect) h = w / draft.aspect
          else w = h * draft.aspect
        }
        const x0 = p[0] < fx ? fx - w : fx
        const y0 = p[1] < fy ? fy - h : fy
        setDraft({ ...draft, rect: [x0, y0, x0 + w, y0 + h] })
        break
      }
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
        if (Math.hypot(...offset) * scale > 2) ctx.updateSelected({ offset })
        break
      }
      case 'resize':
        ctx.updateSelected({ rect: draft.rect })
        break
      case 'shape': {
        const [x0, y0] = draft.from
        const [x1, y1] = p
        if (draft.tool === 'rect' || draft.tool === 'ellipse' || draft.tool === 'redactArea') {
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
        const kind = tool as 'highlight' | 'underline' | 'strikeout' | 'redactText'
        pdf.textQuads(page.id, draft.from, p).then((quads) => {
          if (quads.length) ctx.create(page.id, { kind, quads })
        })
        break
      }
    }
  }

  const onDoubleClick = (event: MouseEvent) => {
    if (tool !== 'select' || editor) return
    const hit = hitTest(toPage(event))
    if (hit?.type === 'FreeText') openTextEditor(hit)
  }

  const commitText = (text: string) => {
    const current = editor
    setEditor(null)
    if (!current) return
    if (current.annot) {
      if (text !== current.annot.contents) ctx.updateSelected({ contents: text })
    } else if (text.trim()) {
      ctx.create(page.id, { kind: 'text', at: current.at, text })
    }
  }

  const selected = selection?.pageId === page.id ? selection.info : null
  const moveOffset = draft?.kind === 'move' ? [draft.to[0] - draft.from[0], draft.to[1] - draft.from[1]] : [0, 0]
  const outline = draft?.kind === 'resize' ? draft.rect : selected?.bounds
  const resizable = tool === 'select' && selected?.rect && RESIZABLE_TYPES.has(selected.type) && !draft
  const handle = HANDLE_SIZE / scale

  return (
    <>
      <svg
        ref={svgRef}
        className={`annot-layer ${tool === 'select' ? '' : 'annot-layer--drawing'}`}
        style={{ cursor: tool === 'select' && (hovering || draft) ? 'move' : CURSORS[tool] }}
        viewBox={`0 0 ${page.width} ${page.height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
        onPointerLeave={() => setHovering(false)}
        onDoubleClick={onDoubleClick}
      >
        {outline && !editor && (
          <rect
            className="annot-selection"
            x={outline[0] - 2 + moveOffset[0]}
            y={outline[1] - 2 + moveOffset[1]}
            width={outline[2] - outline[0] + 4}
            height={outline[3] - outline[1] + 4}
          />
        )}
        {resizable &&
          corners(selected.rect!).map(([x, y], corner) => (
            <rect
              key={corner}
              className="annot-handle"
              style={{ cursor: corner % 2 ? 'nesw-resize' : 'nwse-resize' }}
              x={x - handle / 2}
              y={y - handle / 2}
              width={handle}
              height={handle}
              onPointerDown={(e) => onHandleDown(e, corner, selected.rect!, selected.type === 'Stamp')}
            />
          ))}
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
      {editor && (
        <TextBoxEditor
          initial={editor.annot?.contents ?? ''}
          at={editor.at}
          scale={scale}
          font={editor.annot?.font ?? style.font ?? 'Helv'}
          fontSize={editor.annot?.fontSize ?? style.fontSize ?? 14}
          color={editor.annot?.color ? rgbToHex(editor.annot.color) : color}
          onCommit={commitText}
          onCancel={() => setEditor(null)}
        />
      )}
    </>
  )
}

interface TextBoxEditorProps {
  initial: string
  at: Point
  scale: number
  font: TextFont
  fontSize: number
  color: string
  onCommit(text: string): void
  onCancel(): void
}

function TextBoxEditor({ initial, at, scale, font, fontSize, color, onCommit, onCancel }: TextBoxEditorProps) {
  const [text, setText] = useState(initial)
  const cancelled = useRef(false)
  return (
    <textarea
      className="text-box-editor"
      aria-label="Text box"
      autoFocus
      value={text}
      rows={Math.max(text.split('\n').length, 1)}
      spellCheck={false}
      style={{
        left: (at[0] + TEXT_PADDING) * scale,
        top: (at[1] + TEXT_PADDING) * scale,
        fontFamily: FONTS.find((f) => f.font === font)?.css,
        fontSize: fontSize * scale,
        color,
      }}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
      onBlur={() => (cancelled.current ? onCancel() : onCommit(text))}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function ShapePreview({ draft, color, width, opacity }: { draft: Extract<Draft, { kind: 'shape' }>; color: string; width: number; opacity: number }) {
  const [x0, y0] = draft.from
  const [x1, y1] = draft.to
  const common = { fill: 'none', stroke: color, strokeWidth: width, opacity }
  if (draft.tool === 'redactArea') {
    const rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }
    return <rect {...rect} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
  }
  if (draft.tool === 'rect') {
    return <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} {...common} />
  }
  if (draft.tool === 'ellipse') {
    return <ellipse cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} rx={Math.abs(x1 - x0) / 2} ry={Math.abs(y1 - y0) / 2} {...common} />
  }
  return <line x1={x0} y1={y0} x2={x1} y2={y1} strokeLinecap="round" {...common} />
}
