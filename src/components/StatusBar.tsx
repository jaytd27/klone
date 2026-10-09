import { paperSize } from '../format'
import type { PageInfo } from '../pdf/protocol'

interface Props {
  page: PageInfo | null
  currentPage: number
  pageCount: number
  edits: number
  redactions: number
  /** Characters of text on the current page; null while unknown. */
  textChars: number | null
}

export function StatusBar({ page, currentPage, pageCount, edits, redactions, textChars }: Props) {
  return (
    <footer className="kw-statusbar statusbar" aria-label="Document status">
      {page ? (
        <>
          <span>
            p. {currentPage + 1} / {pageCount}
          </span>
          <span className="statusbar__optional">{paperSize(page)}</span>
          <span className="statusbar__optional">
            {Math.round(page.width)} × {Math.round(page.height)} pt
          </span>
          <span>{edits === 1 ? '1 edit' : `${edits} edits`}</span>
          {textChars !== null && <span className="statusbar__optional">{textChars > 0 ? 'Text layer' : 'No text layer · run OCR'}</span>}
          {redactions > 0 && (
            <span className="statusbar__warning">
              <span className="kw-dot kw-dot--warning" /> {redactions} redaction {redactions === 1 ? 'mark' : 'marks'} not applied
            </span>
          )}
        </>
      ) : (
        <span>No document open · files stay on this device</span>
      )}
    </footer>
  )
}
