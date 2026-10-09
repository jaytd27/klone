import { useState } from 'react'
import { INKS, MARKERS, hexToRgb } from '../annotations/tools'
import type { WatermarkSpec } from '../pdf/protocol'
import { Modal } from './Modal'

export type WatermarkPages = 'all' | 'current' | 'selected'

const SIZES = [24, 36, 48, 60, 72, 96, 120]
const OPACITY_STEPS = [0.15, 0.25, 0.4, 0.6, 1]
const ANGLES = [
  { value: 45, label: 'Diagonal up' },
  { value: -45, label: 'Diagonal down' },
  { value: 0, label: 'Horizontal' },
  { value: 90, label: 'Vertical' },
]

interface Props {
  selectedCount: number
  onApply(spec: WatermarkSpec, pages: WatermarkPages): void
  onClose(): void
}

export function WatermarkDialog({ selectedCount, onApply, onClose }: Props) {
  const [text, setText] = useState('CONFIDENTIAL')
  const [fontSize, setFontSize] = useState(72)
  const [color, setColor] = useState('#B42318')
  const [opacity, setOpacity] = useState(0.25)
  const [angle, setAngle] = useState(45)
  const [pages, setPages] = useState<WatermarkPages>('all')

  const apply = () => onApply({ text: text.trim(), fontSize, color: hexToRgb(color), opacity, angle }, pages)

  return (
    <Modal
      title="Add a watermark"
      onClose={onClose}
      footer={
        <>
          <span className="modal__note">The watermark becomes part of the page. Undo removes it.</span>
          <span className="modal__spacer" />
          <button className="kw-btn kw-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="kw-btn kw-btn--primary" onClick={apply} disabled={!text.trim()}>
            Add watermark
          </button>
        </>
      }
    >
      <div className="watermark-preview" aria-hidden="true">
        <span style={{ color, opacity, transform: `rotate(${-angle}deg)`, fontSize: Math.min(fontSize / 3, 28) }}>{text || ' '}</span>
      </div>
      <div className="form-grid">
        <label htmlFor="wm-text">Text</label>
        <input id="wm-text" className="kw-input" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} autoFocus />

        <span>Color</span>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {[...INKS, ...MARKERS].map(({ hex, name }) => (
            <button key={hex} className="kw-swatch" role="radio" aria-checked={color === hex} aria-label={name} title={name} style={{ background: hex }} onClick={() => setColor(hex)} />
          ))}
        </div>

        <label htmlFor="wm-size">Size</label>
        <select id="wm-size" className="kw-select" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s} pt
            </option>
          ))}
        </select>

        <label htmlFor="wm-opacity">Opacity</label>
        <select id="wm-opacity" className="kw-select" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))}>
          {OPACITY_STEPS.map((o) => (
            <option key={o} value={o}>
              {Math.round(o * 100)}%
            </option>
          ))}
        </select>

        <label htmlFor="wm-angle">Angle</label>
        <select id="wm-angle" className="kw-select" value={angle} onChange={(e) => setAngle(Number(e.target.value))}>
          {ANGLES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        <span>Pages</span>
        <div className="radio-row" role="radiogroup" aria-label="Pages">
          <label>
            <input type="radio" name="wm-pages" checked={pages === 'all'} onChange={() => setPages('all')} /> All pages
          </label>
          <label>
            <input type="radio" name="wm-pages" checked={pages === 'current'} onChange={() => setPages('current')} /> Current page
          </label>
          {selectedCount > 1 && (
            <label>
              <input type="radio" name="wm-pages" checked={pages === 'selected'} onChange={() => setPages('selected')} /> {selectedCount} selected pages
            </label>
          )}
        </div>
      </div>
    </Modal>
  )
}
