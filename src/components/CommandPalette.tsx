import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

export interface Command {
  id: string
  label: string
  icon: IconName
  /** Extra words to match on. */
  keywords?: string
  shortcut?: string
  disabled?: boolean
  run(): void
}

interface Props {
  commands: Command[]
  onClose(): void
}

/** Ctrl+K command bar: the home for infrequent, heavier operations. */
export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return commands.filter((c) => {
      if (c.disabled) return false
      const text = `${c.label} ${c.keywords ?? ''}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
  }, [commands, query])

  const current = Math.min(active, Math.max(matches.length - 1, 0))

  useEffect(() => {
    listRef.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <dialog
      ref={dialogRef}
      className="command-palette"
      aria-label="Command bar"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="command-palette__body">
        <label className="kw-command command-palette__input">
          <Icon name="command" size={15} />
          <input
            autoFocus
            value={query}
            placeholder="Do anything… merge, OCR, watermark, redact"
            aria-label="Command"
            aria-controls="command-list"
            aria-activedescendant={matches[current] ? `cmd-${matches[current].id}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, matches.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(matches[current])
              }
            }}
          />
          <kbd className="kw-kbd">Esc</kbd>
        </label>
        <ul ref={listRef} id="command-list" className="command-palette__list" role="listbox" aria-label="Commands">
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === current}
              className={`kw-menu__item command-palette__item ${i === current ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              <Icon name={c.icon} />
              <span>{c.label}</span>
              {c.shortcut && <kbd className="kw-kbd">{c.shortcut}</kbd>}
            </li>
          ))}
          {matches.length === 0 && <li className="command-palette__empty kw-muted">No matching command</li>}
        </ul>
      </div>
    </dialog>
  )
}
