import { useRef, useState, type PointerEvent } from 'react'
import { trimCanvas } from '../images'
import { Modal } from './Modal'

const STORAGE_KEY = 'klone.signatures'
const MAX_SAVED = 6
const INKS = [
  { label: 'Black', value: '#111111' },
  { label: 'Blue', value: '#1c3faa' },
]
const SCRIPT_FONTS = [
  { label: 'Script', css: "'Segoe Script', 'Brush Script MT', cursive" },
  { label: 'Handwriting', css: "'Lucida Handwriting', 'Apple Chancery', cursive" },
  { label: 'Marker', css: "'Ink Free', 'Bradley Hand', cursive" },
]
const PAD_WIDTH = 520
const PAD_HEIGHT = 180

function loadSaved(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

function storeSaved(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage may be unavailable (private mode) or full; saving is optional.
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the signature'))), 'image/png'))
}

interface Props {
  onUse(signature: Blob): void
  onClose(): void
}

type Tab = 'saved' | 'draw' | 'type'

export function SignatureDialog({ onUse, onClose }: Props) {
  const [saved, setSaved] = useState(loadSaved)
  const [tab, setTab] = useState<Tab>(() => (saved.length ? 'saved' : 'draw'))
  const [ink, setInk] = useState(INKS[0].value)
  const [typed, setTyped] = useState('')
  const [scriptFont, setScriptFont] = useState(SCRIPT_FONTS[0].css)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [remember, setRemember] = useState(true)
  const padRef = useRef<HTMLCanvasElement>(null)
  const lastPoint = useRef<{ x: number; y: number; mid: { x: number; y: number } } | null>(null)

  const dpr = window.devicePixelRatio || 1

  const switchTab = (next: Tab) => {
    setTab(next)
    // The drawing pad is recreated empty when its tab is shown again.
    setHasDrawing(false)
  }

  const padPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const sx = event.currentTarget.width / rect.width
    const sy = event.currentTarget.height / rect.height
    return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy }
  }

  const onPadDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const p = padPoint(event)
    lastPoint.current = { ...p, mid: p }
  }

  const onPadMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = lastPoint.current
    if (!last) return
    const p = padPoint(event)
    const ctx = event.currentTarget.getContext('2d')!
    // Smooth the stroke with quadratic curves through segment midpoints.
    const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 }
    ctx.strokeStyle = ink
    ctx.lineWidth = 2.6 * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.mid.x, last.mid.y)
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y)
    ctx.stroke()
    lastPoint.current = { ...p, mid }
    setHasDrawing(true)
  }

  const clearPad = () => {
    const pad = padRef.current
    pad?.getContext('2d')!.clearRect(0, 0, pad.width, pad.height)
    setHasDrawing(false)
  }

  const renderTyped = (): HTMLCanvasElement => {
    const size = 96
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    ctx.font = `${size}px ${scriptFont}`
    canvas.width = Math.ceil(ctx.measureText(typed).width + size)
    canvas.height = Math.ceil(size * 1.6)
    ctx.font = `${size}px ${scriptFont}`
    ctx.fillStyle = ink
    ctx.textBaseline = 'middle'
    ctx.fillText(typed, size / 2, canvas.height / 2)
    return canvas
  }

  const placeNew = async () => {
    const source = tab === 'draw' ? padRef.current : renderTyped()
    const trimmed = source && trimCanvas(source)
    if (!trimmed) return
    const blob = await canvasToBlob(trimmed)
    if (remember) {
      const next = [trimmed.toDataURL('image/png'), ...saved].slice(0, MAX_SAVED)
      storeSaved(next)
    }
    onUse(blob)
  }

  const placeSaved = async (dataUrl: string) => {
    onUse(await (await fetch(dataUrl)).blob())
  }

  const removeSaved = (index: number) => {
    const next = saved.filter((_, i) => i !== index)
    setSaved(next)
    storeSaved(next)
    if (!next.length) switchTab('draw')
  }

  const canUse = tab === 'draw' ? hasDrawing : tab === 'type' ? typed.trim().length > 0 : false

  return (
    <Modal
      title="Add a signature"
      onClose={onClose}
      footer={
        tab === 'saved' ? (
          <button className="button" onClick={onClose}>
            Cancel
          </button>
        ) : (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Save for next time
            </label>
            <span className="modal__spacer" />
            <button className="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button button--primary" onClick={placeNew} disabled={!canUse}>
              Place signature
            </button>
          </>
        )
      }
    >
      <div className="tabs" role="tablist">
        {saved.length > 0 && (
          <button role="tab" aria-selected={tab === 'saved'} onClick={() => switchTab('saved')}>
            Saved
          </button>
        )}
        <button role="tab" aria-selected={tab === 'draw'} onClick={() => switchTab('draw')}>
          Draw
        </button>
        <button role="tab" aria-selected={tab === 'type'} onClick={() => switchTab('type')}>
          Type
        </button>
      </div>

      {tab === 'saved' && (
        <div className="saved-signatures">
          {saved.map((url, i) => (
            <div key={url} className="saved-signature">
              <button className="saved-signature__use" onClick={() => placeSaved(url)} aria-label={`Use saved signature ${i + 1}`}>
                <img src={url} alt="" />
              </button>
              <button className="saved-signature__remove" onClick={() => removeSaved(i)} aria-label={`Delete saved signature ${i + 1}`} title="Delete">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {tab !== 'saved' && (
        <div className="ink-picker" role="radiogroup" aria-label="Ink color">
          {INKS.map((option) => (
            <button
              key={option.value}
              className="swatch"
              role="radio"
              aria-checked={ink === option.value}
              aria-label={option.label}
              style={{ background: option.value }}
              onClick={() => setInk(option.value)}
            />
          ))}
        </div>
      )}

      {tab === 'draw' && (
        <div className="signature-pad">
          <canvas
            ref={padRef}
            width={PAD_WIDTH * dpr}
            height={PAD_HEIGHT * dpr}
            style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}` }}
            onPointerDown={onPadDown}
            onPointerMove={onPadMove}
            onPointerUp={() => (lastPoint.current = null)}
            onPointerCancel={() => (lastPoint.current = null)}
            aria-label="Draw your signature here"
          />
          <div className="signature-pad__footer">
            <span>Sign above</span>
            <button className="button" onClick={clearPad} disabled={!hasDrawing}>
              Clear
            </button>
          </div>
        </div>
      )}

      {tab === 'type' && (
        <div className="signature-type">
          <input className="text-input" placeholder="Type your name" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          <div className="signature-fonts">
            {SCRIPT_FONTS.map((f) => (
              <button
                key={f.label}
                className="signature-font"
                aria-pressed={scriptFont === f.css}
                style={{ fontFamily: f.css, color: ink }}
                onClick={() => setScriptFont(f.css)}
              >
                {typed || 'Your name'}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
