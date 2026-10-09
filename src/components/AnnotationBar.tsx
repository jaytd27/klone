import { useState } from 'react'
import type { AnnotSelection } from '../annotations/context'
import { FONTS, FONT_SIZES, OPACITIES, PALETTE, REDACT_TOOLS, STROKE_TOOLS, WIDTHS, hexToRgb, rgbToHex, type Tool } from '../annotations/tools'
import type { AnnotPatch, AnnotStyle, TextFont } from '../pdf/protocol'
import { Icon, type IconName } from './Icon'

const TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'select', icon: 'cursor', label: 'Select (Esc)' },
  { tool: 'highlight', icon: 'highlight', label: 'Highlight text' },
  { tool: 'underline', icon: 'underline', label: 'Underline text' },
  { tool: 'strikeout', icon: 'strikeout', label: 'Strike out text' },
  { tool: 'note', icon: 'note', label: 'Sticky note' },
  { tool: 'text', icon: 'textBox', label: 'Text box' },
  { tool: 'editText', icon: 'editText', label: 'Edit existing text' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
  { tool: 'line', icon: 'line', label: 'Line' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow' },
  { tool: 'ink', icon: 'ink', label: 'Freehand' },
]

const REDACTION_TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'redactText', icon: 'redactText', label: 'Mark text for redaction' },
  { tool: 'redactArea', icon: 'redactArea', label: 'Mark an area for redaction' },
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
  Stamp: 'Image',
  Polygon: 'Polygon',
  PolyLine: 'Polyline',
  Redact: 'Redaction mark',
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
  onAddImage(): void
  onAddSignature(): void
  onAddWatermark(): void
  /** Redaction marks not yet applied. */
  redactions: number
  onFindRedact(): void
  onApplyRedactions(): void
}

export function AnnotationBar(props: Props) {
  const { tool, toolStyle, selection, busy } = props
  const info = selection?.info ?? null

  // Controls edit the selected annotation if there is one, else the tool's defaults.
  let controls: {
    color: string | null
    width: number | null
    opacity: number
    font: TextFont | null
    fontSize: number | null
  } | null = null
  if (info) {
    controls = {
      color: info.color ? rgbToHex(info.color) : null,
      width: info.width,
      opacity: info.opacity,
      font: info.font,
      fontSize: info.fontSize,
    }
  } else if (tool !== 'select') {
    controls = {
      color: rgbToHex(toolStyle.color),
      width: STROKE_TOOLS.has(tool) ? toolStyle.width : null,
      opacity: toolStyle.opacity,
      font: tool === 'text' ? (toolStyle.font ?? 'Helv') : null,
      fontSize: tool === 'text' ? (toolStyle.fontSize ?? 14) : null,
    }
  }
  // A text box's contents are its text, edited on the page rather than as a comment.
  const showComment = info && info.type !== 'FreeText'

  const redactionSelected = info?.type === 'Redact'
  const toolHint =
    !info && tool === 'editText'
      ? 'Click a line to edit it, or clear it to delete. New text uses the closest standard font.'
      : !info && REDACT_TOOLS.has(tool)
      ? tool === 'redactText'
        ? 'Drag across text to mark it. Nothing is removed until you apply redactions.'
        : 'Drag a box over anything, including images, to mark it. Nothing is removed until you apply redactions.'
      : null

  const toolButton = ({ tool: t, icon, label }: { tool: Tool; icon: IconName; label: string }) => (
    <button key={t} className="icon-button" aria-pressed={tool === t} title={label} aria-label={label} onClick={() => props.onToolChange(t)}>
      <Icon name={icon} />
    </button>
  )

  const change = (patch: Partial<AnnotStyle>) => {
    if (info) props.onUpdateSelected(patch)
    else props.onToolStyleChange(patch)
  }

  return (
    <div className="annot-bar" role="toolbar" aria-label="Annotation tools">
      <div className="annot-bar__tools">
        {TOOLS.map(toolButton)}
      </div>

      <span className="toolbar__divider" />

      <div className="annot-bar__tools">
        <button className="icon-button" title="Add an image" aria-label="Add an image" onClick={props.onAddImage} disabled={busy}>
          <Icon name="image" />
        </button>
        <button className="icon-button" title="Add a signature" aria-label="Add a signature" onClick={props.onAddSignature} disabled={busy}>
          <Icon name="signature" />
        </button>
        <button className="icon-button" title="Add a watermark" aria-label="Add a watermark" onClick={props.onAddWatermark} disabled={busy}>
          <Icon name="watermark" />
        </button>
      </div>

      <span className="toolbar__divider" />

      <div className="annot-bar__tools" role="group" aria-label="Redaction">
        {REDACTION_TOOLS.map(toolButton)}
        <button className="icon-button" title="Find and redact" aria-label="Find and redact" onClick={props.onFindRedact} disabled={busy}>
          <Icon name="search" />
        </button>
        <button
          className={`button button--compact ${props.redactions ? 'button--danger' : ''}`}
          onClick={props.onApplyRedactions}
          disabled={busy || !props.redactions}
          title="Permanently remove everything under the redaction marks"
        >
          Apply{props.redactions ? ` (${props.redactions})` : ''}
        </button>
      </div>

      <span className="toolbar__divider" />

      {redactionSelected ? (
        <div className="annot-bar__style">
          <span className="annot-bar__label">Redaction mark</span>
          <span className="annot-bar__hint">Not applied yet</span>
          <button className="icon-button" onClick={props.onDeleteSelected} disabled={busy} title="Remove this mark (Del)">
            <Icon name="trash" />
          </button>
        </div>
      ) : toolHint ? (
        <span className="annot-bar__hint">{toolHint}</span>
      ) : controls ? (
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
          {controls.font !== null && (
            <select
              className="zoom-select"
              aria-label="Font"
              value={controls.font}
              disabled={busy}
              onChange={(e) => change({ font: e.target.value as TextFont })}
            >
              {FONTS.map((f) => (
                <option key={f.font} value={f.font}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          {controls.fontSize !== null && (
            <select
              className="zoom-select"
              aria-label="Font size"
              value={FONT_SIZES.includes(controls.fontSize) ? controls.fontSize : ''}
              disabled={busy}
              onChange={(e) => change({ fontSize: Number(e.target.value) })}
            >
              {!FONT_SIZES.includes(controls.fontSize) && <option value="">{controls.fontSize} pt</option>}
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} pt
                </option>
              ))}
            </select>
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
              {info.type === 'FreeText' && <span className="annot-bar__hint">Double-click to edit the text</span>}
              {showComment && <CommentField
                key={`${selection.pageId}:${selection.annotId}`}
                initial={info.contents}
                autoFocus={props.focusComment}
                disabled={busy}
                onCommit={(contents) => props.onUpdateSelected({ contents })}
              />}
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
