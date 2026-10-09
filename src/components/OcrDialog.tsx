import { useEffect, useRef, useState } from 'react'
import { pdf } from '../pdf/client'
import type { OcrPage, OcrWord, PageInfo } from '../pdf/protocol'
import { Modal } from './Modal'

const LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
]
/** Pages with fewer characters than this are treated as having no text. */
const MIN_TEXT_CHARS = 20
/** Render pages at about 300 dpi, which suits Tesseract, within a pixel budget. */
const OCR_DPI = 300
const MAX_OCR_PIXELS = 16_000_000
/**
 * Words Tesseract is less sure of than this (0-100) are dropped. Sideways or
 * noisy pages otherwise yield garbage that would pollute search and copying.
 */
const MIN_WORD_CONFIDENCE = 60
/** A page whose average confidence is below this is treated as unreadable. */
const MIN_PAGE_CONFIDENCE = 50

type Which = 'untexted' | 'all' | 'current'

interface Props {
  pages: PageInfo[]
  currentPage: number
  /** `results` has an entry for every page processed, even ones where nothing was found. */
  onDone(results: OcrPage[]): void
  onClose(): void
}

/** Renders a page into a canvas for Tesseract; returns it with its scale (pixels per point). */
async function renderForOcr(page: PageInfo): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const scale = Math.min(OCR_DPI / 72, Math.sqrt(MAX_OCR_PIXELS / (page.width * page.height)))
  const { width, height, pixels } = await pdf.render(page.id, scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
  return { canvas, scale }
}

/** Flattens Tesseract's block tree into words in page space. */
function toWords(blocks: Tesseract.Block[] | null, scale: number): OcrWord[] {
  const words: OcrWord[] = []
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const { x0: bx0, y0: by0, x1: bx1, y1: by1 } = line.baseline
        for (const word of line.words) {
          const text = word.text.trim()
          if (!text || word.confidence < MIN_WORD_CONFIDENCE) continue
          // The baseline may slope; take its height under the middle of the word.
          const cx = (word.bbox.x0 + word.bbox.x1) / 2
          const baseline = bx1 === bx0 ? by0 : by0 + ((by1 - by0) * (cx - bx0)) / (bx1 - bx0)
          words.push({
            text,
            bbox: [word.bbox.x0 / scale, line.bbox.y0 / scale, word.bbox.x1 / scale, line.bbox.y1 / scale],
            baseline: baseline / scale,
          })
        }
      }
    }
  }
  return words
}

export function OcrDialog({ pages, currentPage, onDone, onClose }: Props) {
  const [stats, setStats] = useState<Map<number, number> | null>(null)
  const [language, setLanguage] = useState('eng')
  const [which, setWhich] = useState<Which>('untexted')
  const [progress, setProgress] = useState<{ done: number; total: number; step: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    pdf.textStats().then(
      (list) => setStats(new Map(list.map((s) => [s.page, s.chars]))),
      (err) => setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  const untexted = stats ? pages.filter((p) => (stats.get(p.id) ?? 0) < MIN_TEXT_CHARS) : []
  const targets = which === 'all' ? pages : which === 'current' ? [pages[currentPage]] : untexted

  const run = async () => {
    cancelled.current = false
    setError(null)
    setProgress({ done: 0, total: targets.length, step: 'Loading the text recogniser…' })
    let worker: Tesseract.Worker | null = null
    const results: OcrPage[] = []
    try {
      const { createWorker } = await import('tesseract.js')
      worker = await createWorker(language, 1, {
        logger: (m: Tesseract.LoggerMessage) => {
          if (m.status === 'recognizing text') setProgress((p) => p && { ...p, step: `Reading page… ${Math.round(m.progress * 100)}%` })
        },
      })
      for (const [i, page] of targets.entries()) {
        if (cancelled.current) break
        setProgress({ done: i, total: targets.length, step: 'Rendering page…' })
        const { canvas, scale } = await renderForOcr(page)
        const { data } = await worker.recognize(canvas, {}, { blocks: true })
        const readable = data.confidence >= MIN_PAGE_CONFIDENCE
        results.push({ page: page.id, words: readable ? toWords(data.blocks, scale) : [] })
      }
      if (results.length) onDone(results)
      else onClose()
    } catch (err) {
      setProgress(null)
      setError(`Text recognition failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      await worker?.terminate()
    }
  }

  const running = progress !== null && !error

  return (
    <Modal
      title="Run OCR"
      onClose={() => {
        cancelled.current = true
        if (!running) onClose()
      }}
      footer={
        running ? (
          <>
            <span className="modal__note">Stopping keeps the pages finished so far.</span>
            <span className="modal__spacer" />
            <button className="kw-btn kw-btn--secondary" onClick={() => (cancelled.current = true)}>
              Stop
            </button>
          </>
        ) : (
          <>
            <span className="modal__spacer" />
            <button className="kw-btn kw-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="kw-btn kw-btn--primary" onClick={run} disabled={!stats || !targets.length}>
              Run OCR on {targets.length === 1 ? '1 page' : `${targets.length} pages`}
            </button>
          </>
        )
      }
    >
      {running ? (
        <div className="ocr-progress" role="status">
          <p>
            Page {Math.min(progress.done + 1, progress.total)} of {progress.total}: {progress.step}
          </p>
          <div className="kw-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="kw-progress__bar" style={{ width: `${(100 * progress.done) / Math.max(progress.total, 1)}%` }} />
          </div>
        </div>
      ) : (
        <>
          <p className="modal__intro">
            Finds the words in scanned pages and adds them as invisible text, so you can search, select, highlight and redact them. The pages
            look the same. Your file stays on this device; only the recogniser and language data are downloaded, once.
          </p>
          <div className="form-grid">
            <label htmlFor="ocr-lang">Language</label>
            <select id="ocr-lang" className="kw-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>

            <span>Pages</span>
            <div className="radio-row" role="radiogroup" aria-label="Pages">
              <label>
                <input type="radio" name="ocr-pages" checked={which === 'untexted'} onChange={() => setWhich('untexted')} /> Pages without text
                {stats ? ` (${untexted.length})` : ''}
              </label>
              <label>
                <input type="radio" name="ocr-pages" checked={which === 'all'} onChange={() => setWhich('all')} /> All pages
              </label>
              <label>
                <input type="radio" name="ocr-pages" checked={which === 'current'} onChange={() => setWhich('current')} /> Current page
              </label>
            </div>
          </div>
          {which === 'all' && untexted.length < pages.length && (
            <p className="modal__note">Pages that already have text will get a second, duplicate text layer.</p>
          )}
          {stats && which === 'untexted' && !untexted.length && <p className="modal__note">Every page already has text.</p>}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
