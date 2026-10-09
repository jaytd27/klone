import { useState, type FormEvent } from 'react'
import { pdf } from '../pdf/client'
import { Modal } from './Modal'

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

interface FindProps {
  onMark(query: string, matchCase: boolean): void
  onClose(): void
}

/** Searches the document and marks every match for redaction. */
export function FindRedactDialog({ onMark, onClose }: FindProps) {
  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [result, setResult] = useState<{ query: string; matchCase: boolean; hits: number; pages: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const current = result && result.query === query.trim() && result.matchCase === matchCase ? result : null

  const find = async (event?: FormEvent) => {
    event?.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      const hits = await pdf.search(q, matchCase)
      setResult({ query: q, matchCase, hits: hits.length, pages: new Set(hits.map((h) => h.page)).size })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  return (
    <Modal
      title="Find and redact"
      onClose={onClose}
      footer={
        <>
          <span className="modal__spacer" />
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          {current && current.hits > 0 ? (
            <button className="button button--primary" onClick={() => onMark(current.query, current.matchCase)}>
              Mark {plural(current.hits, 'match', 'matches')}
            </button>
          ) : (
            <button className="button button--primary" onClick={() => find()} disabled={!query.trim() || searching}>
              {searching ? 'Searching…' : 'Find'}
            </button>
          )}
        </>
      }
    >
      <form className="find-form" onSubmit={find}>
        <input
          className="text-input"
          placeholder="Word or phrase, e.g. a name or account number"
          aria-label="Text to find"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <label className="checkbox-label">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
        </label>
      </form>
      <p className="find-result" role="status">
        {error ??
          (current
            ? current.hits
              ? `Found ${plural(current.hits, 'match', 'matches')} on ${plural(current.pages, 'page')}. They'll be marked for redaction; nothing is removed until you apply redactions.`
              : 'No matches. Text in scanned pages can’t be found until they have been through OCR.'
            : 'Every match in the document will be marked. You can review and remove marks before applying them.')}
      </p>
    </Modal>
  )
}

interface ApplyProps {
  count: number
  onApply(): void
  onClose(): void
}

/** Confirms permanently removing the content under every redaction mark. */
export function ApplyRedactionsDialog({ count, onApply, onClose }: ApplyProps) {
  return (
    <Modal
      title="Apply redactions"
      onClose={onClose}
      footer={
        <>
          <span className="modal__spacer" />
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button--danger" onClick={onApply} autoFocus>
            Apply {plural(count, 'redaction')}
          </button>
        </>
      }
    >
      <p>
        Everything under the {plural(count, 'mark')} will be permanently removed: text, the covered parts of images in the page, and drawings
        that sit entirely inside a mark. Comments, text boxes, added images and form fields that overlap a mark are deleted entirely. Each
        area is then filled with a black box.
      </p>
      <p className="modal__note">
        You can still undo until you download. The downloaded file is rewritten from scratch, so the removed content isn’t hidden in it.
      </p>
    </Modal>
  )
}

interface UnappliedProps {
  count: number
  onApplyAndDownload(): void
  onDownloadAnyway(): void
  onClose(): void
}

/** Shown on download when redaction marks haven't been applied yet. */
export function UnappliedRedactionsDialog({ count, onApplyAndDownload, onDownloadAnyway, onClose }: UnappliedProps) {
  return (
    <Modal
      title="Redactions not applied"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onDownloadAnyway}>
            Download with marks only
          </button>
          <span className="modal__spacer" />
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button--primary" onClick={onApplyAndDownload} autoFocus>
            Apply and download
          </button>
        </>
      }
    >
      <p>
        This document has {plural(count, 'redaction mark')} that {count === 1 ? 'hasn’t' : 'haven’t'} been applied. The content under them is
        still in the file, and anyone can read it.
      </p>
    </Modal>
  )
}
