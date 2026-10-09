import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  onClose(): void
  children: ReactNode
  footer: ReactNode
}

/** A modal built on <dialog>, which handles focus trapping and Esc. */
export function Modal({ title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal__body">
        <header className="modal__header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal__content">{children}</div>
        <footer className="modal__footer">{footer}</footer>
      </div>
    </dialog>
  )
}
