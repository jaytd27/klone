import { useEffect, useRef, useState } from 'react'
import { useAnnotations } from '../annotations/context'
import { rgbToHex } from '../annotations/tools'
import { pdf } from '../pdf/client'
import type { PageInfo, TextLine } from '../pdf/protocol'

const FAMILIES: Record<TextLine['font']['family'], string> = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: "'Times New Roman', Times, serif",
  mono: "'Courier New', Courier, monospace",
}

/** Replacement text is written in a standard font with Latin-1 encoding. */
const UNSUPPORTED = /[^ -ÿ]/u

interface Props {
  page: PageInfo
  /** CSS pixels per PDF point. */
  scale: number
}

/** Outlines the lines of existing page text and lets you edit one in place. */
export function TextEditLayer({ page, scale }: Props) {
  const ctx = useAnnotations()
  const [lines, setLines] = useState<TextLine[]>([])
  const [editing, setEditing] = useState<TextLine | null>(null)

  useEffect(() => {
    let live = true
    pdf.textLines(page.id).then(
      (list) => {
        if (live) setLines(list)
      },
      (err) => {
        if (err?.name !== 'AbortError') console.error('Failed to load text lines', err)
      },
    )
    return () => {
      live = false
    }
  }, [page.id, page.rev])

  return (
    <div className="text-edit-layer">
      {lines.map((line, i) => {
        if (line === editing) return null
        const [x0, y0, x1, y1] = line.bbox
        return (
          <button
            key={i}
            className="text-line"
            style={{ left: x0 * scale, top: y0 * scale, width: (x1 - x0) * scale, height: (y1 - y0) * scale }}
            title="Click to edit this text"
            aria-label={`Edit text: ${line.text}`}
            disabled={ctx.busy}
            onClick={() => setEditing(line)}
          />
        )
      })}
      {editing && (
        <LineEditor
          key={editing.text + editing.bbox.join()}
          line={editing}
          scale={scale}
          onDone={(text) => {
            setEditing(null)
            if (text !== null && text !== editing.text) ctx.editTextLine(page.id, editing, text)
          }}
        />
      )}
    </div>
  )
}

function LineEditor({ line, scale, onDone }: { line: TextLine; scale: number; onDone(text: string | null): void }) {
  const [text, setText] = useState(line.text)
  const done = useRef(false)
  const unsupported = UNSUPPORTED.test(text)
  const [x0, y0, x1] = line.bbox
  // Rotated lines are edited horizontally next to where they are.
  const angle = (Math.atan2(line.dir[1], line.dir[0]) * 180) / Math.PI

  const finish = (value: string | null) => {
    if (done.current) return
    if (value !== null && UNSUPPORTED.test(value)) return
    done.current = true
    onDone(value)
  }

  return (
    <div
      className="line-editor"
      style={{ left: x0 * scale, top: y0 * scale, transform: Math.abs(angle) > 1 ? `rotate(${angle}deg)` : undefined }}
    >
      <input
        autoFocus
        value={text}
        aria-label="Edit text"
        spellCheck={false}
        style={{
          minWidth: (x1 - x0) * scale,
          width: `${Math.max(text.length, 1) + 2}ch`,
          fontFamily: FAMILIES[line.font.family],
          fontWeight: line.font.bold ? 700 : 400,
          fontStyle: line.font.italic ? 'italic' : 'normal',
          fontSize: line.size * scale,
          color: rgbToHex(line.color),
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(unsupported ? null : text)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') finish(text)
          else if (e.key === 'Escape') finish(null)
        }}
      />
      {unsupported && <span className="line-editor__warning">Only Latin letters and symbols can be typed into existing text.</span>}
    </div>
  )
}
