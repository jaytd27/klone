import { useEffect } from 'react'
import { Icon } from './Icon'

export interface ToastMessage {
  id: number
  kind: 'info' | 'success' | 'error'
  text: string
  action?: { label: string; run(): void }
}

/** Notices auto-dismiss after 4 s unless they hold an action; errors stay until dismissed. */
const AUTO_DISMISS_MS = 4000

interface Props {
  toasts: ToastMessage[]
  onDismiss(id: number): void
}

export function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss(id: number): void }) {
  useEffect(() => {
    if (toast.kind === 'error' || toast.action) return
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div className={`kw-toast toast toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span className={`kw-dot ${toast.kind === 'error' ? 'kw-dot--danger' : toast.kind === 'success' ? 'kw-dot--success' : 'kw-dot--info'}`} />
      <span className="toast__text">
        {toast.kind === 'error' && <strong>Error · </strong>}
        {toast.text}
      </span>
      {toast.action && (
        <button
          className="kw-float__btn toast__action"
          onClick={() => {
            toast.action!.run()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="kw-float__btn" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
