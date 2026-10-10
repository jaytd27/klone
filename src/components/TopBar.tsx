import { useEffect, useState, type RefObject } from 'react'
import { MODES, type Mode } from '../annotations/modes'
import { THEME_LABELS, type ThemeMode } from '../theme/theme'
import { Icon, type IconName } from './Icon'
import { formatBytes } from '../format'
import { Logo, Wordmark } from './Logo'

export interface SearchState {
  query: string
  /** null before a search has run. */
  count: number | null
  /** Index of the current hit. */
  index: number
}

interface Props {
  fileName: string | null
  dirty: boolean
  fileSize: number | null
  mode: Mode
  busy: boolean
  theme: ThemeMode
  search: SearchState
  searchInputRef: RefObject<HTMLInputElement | null>
  onModeChange(mode: Mode): void
  onSearch(query: string): void
  onSearchStep(step: 1 | -1): void
  onSearchClear(): void
  onOpen(): void
  onExport(): void
  onCommand(): void
  onThemeChange(mode: ThemeMode): void
}

const THEME_ORDER: ThemeMode[] = ['dark', 'light', 'system']
const THEME_ICONS: Record<ThemeMode, IconName> = { dark: 'moon', light: 'sun', system: 'monitor' }

export function TopBar(props: Props) {
  const { fileName, dirty, fileSize, mode, busy, theme, search, searchInputRef } = props
  const { onModeChange, onSearch, onSearchStep, onSearchClear, onOpen, onExport, onCommand, onThemeChange } = props
  const [draft, setDraft] = useState(search.query)
  const hasDoc = fileName !== null

  return (
    <header className="kw-topbar topbar">
      <a className="kw-lockup topbar__brand" href="/">
        <Logo />
        <Wordmark className="topbar__name" />
      </a>

      {hasDoc && (
        <div className="topbar__file">
          <span className="topbar__filename" title={fileName}>
            {fileName}
          </span>
          <span className="kw-badge" role="status">
            <span className={`kw-dot ${dirty ? 'kw-dot--warning' : 'kw-dot--success'}`} />
            {dirty ? 'Unsaved changes' : fileSize !== null ? `Saved · ${formatBytes(fileSize)}` : 'Saved'}
          </span>
        </div>
      )}

      {hasDoc && (
        <div className="topbar__modes">
          <div className="kw-segmented" role="tablist" aria-label="Mode">
            {MODES.map((m) => (
              <button
                key={m.mode}
                className="kw-segmented__item"
                role="tab"
                aria-selected={mode === m.mode}
                title={m.hint}
                onClick={() => onModeChange(m.mode)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="topbar__end">
        {hasDoc && (
          <form
            className="kw-command topbar__search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim() && draft === search.query && search.count) onSearchStep(1)
              else onSearch(draft)
            }}
          >
            <Icon name="search" size={15} />
            <input
              ref={searchInputRef}
              value={draft}
              placeholder="Search text"
              aria-label="Search the document"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft('')
                  onSearchClear()
                  e.currentTarget.blur()
                } else if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault()
                  onSearchStep(-1)
                }
              }}
            />
            {search.count !== null && draft === search.query && (
              <>
                <span className="kw-mono topbar__hits" aria-live="polite">
                  {search.count ? `${search.index + 1}/${search.count}` : '0'}
                </span>
                <button type="button" className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" aria-label="Previous match" onClick={() => onSearchStep(-1)} disabled={!search.count}>
                  <Icon name="chevronUp" />
                </button>
                <button type="button" className="kw-btn kw-btn--ghost kw-btn--icon kw-btn--sm" aria-label="Next match" onClick={() => onSearchStep(1)} disabled={!search.count}>
                  <Icon name="chevronDown" />
                </button>
              </>
            )}
          </form>
        )}

        <button className="kw-btn kw-btn--secondary kw-btn--icon" aria-label="Command bar (Ctrl+K)" title="Do anything… (Ctrl+K)" onClick={onCommand}>
          <Icon name="command" />
        </button>
        <AppearanceMenu theme={theme} onThemeChange={onThemeChange} />
        <span className="kw-divider topbar__divider" />
        <button className="kw-btn kw-btn--secondary" onClick={onOpen} disabled={busy} title="Open a PDF (Ctrl+O)">
          <Icon name="open" />
          <span className="topbar__label">Open</span>
        </button>
        {hasDoc && (
          <button className="kw-btn kw-btn--primary" onClick={onExport} disabled={busy} title="Export the PDF (Ctrl+S)">
            <Icon name="export" />
            <span className="topbar__label">Export</span>
          </button>
        )}
      </div>
    </header>
  )
}

function AppearanceMenu({ theme, onThemeChange }: { theme: ThemeMode; onThemeChange(mode: ThemeMode): void }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const closeOnEscape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="appearance" onPointerDown={(e) => e.stopPropagation()}>
      <button
        className="kw-btn kw-btn--ghost kw-btn--icon"
        aria-label={`Appearance: ${THEME_LABELS[theme]}`}
        title={`Appearance: ${THEME_LABELS[theme]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={THEME_ICONS[theme]} />
      </button>
      {open && (
        <div className="kw-popover menu appearance__menu" role="menu" aria-label="Appearance">
          {THEME_ORDER.map((m) => (
            <button
              key={m}
              className="kw-menu__item"
              role="menuitemradio"
              aria-checked={theme === m}
              onClick={() => {
                setOpen(false)
                onThemeChange(m)
              }}
            >
              <Icon name={THEME_ICONS[m]} />
              {THEME_LABELS[m]}
              {theme === m && (
                <span className="appearance__check">
                  <Icon name="check" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
