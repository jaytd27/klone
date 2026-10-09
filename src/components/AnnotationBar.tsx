import { useState } from 'react'
import type { AnnotSelection } from '../annotations/context'
import { OPACITIES, PALETTE, STROKE_TOOLS, WIDTHS, hexToRgb, rgbToHex, type Tool } from '../annotations/tools'
import type { AnnotPatch, AnnotStyle } from '../pdf/protocol'
import { Icon, type IconName } from './Icon'

const TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'select', icon: 'cursor', label: 'Select (Esc)' },
  { tool: 'highlight', icon: 'highlight', label: 'Highlight text' },
  { tool: 'underline', icon: 'underline', label: 'Underline text' },
  { tool: 'strikeout', icon: 'strikeout', label: 'Strike out text' },
  { tool: 'note', icon: 'note', label: 'Sticky note' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
  { tool: 'line', icon: 'line', label: 'Line' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow' },
  { tool: 'ink', icon: 'ink', label: 'Freehand' },
]

const TYPE_LABELS: Record<string, string> = {
  Highlight: 'Highlight',
  Underline: 'Underline',
  StrikeOut: 'Strikeout',
  Squiggly: 'Squiggly underline',
  Text: 'Note',
  Square: 'Rectangle',
  Circle: 'Ellipse',
  Line: 'Line',
  Ink: 'Freehand drawing',
  FreeText: 'Text box',
  Stamp: 'Stamp',
  Polygon: 'Polygon',
  PolyLine: 'Polyline',
}

interface Props {
  tool: Tool
  /** Style for new annotations made with the current tool. */
  toolStyle: AnnotStyle
  selection: AnnotSelection | null
  busy: boolean
  /** Focus the comment field (set right after placing a note). */
  focusComment: boolean
  onToolChange(tool: Tool): void
  onToolStyleChange(patch: Partial<AnnotStyle>): void
  onUpdateSelected(patch: AnnotPatch): void
  onDeleteSelected(): void
}

export function AnnotationBar(props: Props) {
  const { tool, toolStyle, selection, busy } = props
  const info = selection?.info ?? null

  // Controls edit the selected annotation if there is one, else the tool's defaults.
  let controls: { color: string | null; width: number | null; opacity: number } | null = null
  if (info) {
    controls = { color: info.color ? rgbToHex(info.color) : null, width: info.width, opacity: info.opacity }
  } else if (tool !== 'select') {
    controls = {
      color: rgbToHex(toolStyle.color),
      width: STROKE_TOOLS.has(tool) ? toolStyle.width : null,
      opacity: toolStyle.opacity,
    }
  }

  const change = (patch: Partial<AnnotStyle>) => {
    if (info) props.onUpdateSelected(patch)
    else props.onToolStyleChange(patch)
  }

  return (
    <div className="annot-bar" role="toolbar" aria-label="Annotation tools">
      <div className="annot-bar__tools">
        {TOOLS.map(({ tool: t, icon, label }) => (
          <button
            key={t}
            className="icon-button"
            aria-pressed={tool === t}
            title={label}
            aria-label={label}
            onClick={() => props.onToolChange(t)}
          >
            <Icon name={icon} />
          </button>
        ))}
      </div>

      <span className="toolbar__divider" />

      {controls ? (
        <div className="annot-bar__style">
          {info && <span className="annot-bar__label">{TYPE_LABELS[info.type] ?? info.type}</span>}
          {controls.color !== null && (
            <div className="swatches" role="radiogroup" aria-label="Color">
              {PALETTE.map((hex) => (
                <button
                  key={hex}
                  className="swatch"
                  role="radio"
                  aria-checked={controls.color === hex}
                  aria-label={hex}
                  style={{ background: hex }}
                  disabled={busy}
                  onClick={() => change({ color: hexToRgb(hex) })}
                />
              ))}
            </div>
          )}
          {controls.width !== null && (
            <select
              className="zoom-select"
              aria-label="Stroke width"
              value={WIDTHS.includes(controls.width) ? controls.width : ''}
              disabled={busy}
              onChange={(e) => change({ width: Number(e.target.value) })}
            >
              {!WIDTHS.includes(controls.width) && <option value="">{controls.width} pt</option>}
              {WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w} pt
                </option>
              ))}
            </select>
          )}
          <select
            className="zoom-select"
            aria-label="Opacity"
            value={OPACITIES.includes(controls.opacity) ? controls.opacity : ''}
            disabled={busy}
            onChange={(e) => change({ opacity: Number(e.target.value) })}
          >
            {!OPACITIES.includes(controls.opacity) && <option value="">{Math.round(controls.opacity * 100)}%</option>}
            {OPACITIES.map((o) => (
              <option key={o} value={o}>
                {Math.round(o * 100)}%
              </option>
            ))}
          </select>
          {info && selection && (
            <>
              <CommentField
                key={`${selection.pageId}:${selection.annotId}`}
                initial={info.contents}
                autoFocus={props.focusComment}
                disabled={busy}
                onCommit={(contents) => props.onUpdateSelected({ contents })}
              />
              <button className="icon-button" onClick={props.onDeleteSelected} disabled={busy} title="Delete annotation (Del)">
                <Icon name="trash" />
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="annot-bar__hint">Pick a tool to mark up the page, or click an annotation to edit it.</span>
      )}
    </div>
  )
}

function CommentField({ initial, autoFocus, disabled, onCommit }: { initial: string; autoFocus: boolean; disabled: boolean; onCommit(value: string): void }) {
  const [value, setValue] = useState(initial)
  const commit = () => {
    if (value !== initial) onCommit(value)
  }
  return (
    <input
      className="comment-input"
      placeholder="Add a comment…"
      aria-label="Comment"
      value={value}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setValue(initial)
          e.currentTarget.blur()
        }
        e.stopPropagation()
      }}
    />
  )
}
